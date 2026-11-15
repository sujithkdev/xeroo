'use strict';
/**
 * Krishna Print Hub — Electron main process
 *
 * Starts the Next.js production server and the print agent as child
 * processes, then shows a system-tray icon. Staff open the dashboard
 * by clicking "Open Dashboard" from the tray menu — no Electron window
 * is ever shown; the whole UI lives in the browser at localhost:3000.
 */

const { app, Tray, Menu, shell, dialog, nativeImage } = require('electron');
const path  = require('path');
const { fork, spawn } = require('child_process');
const fs    = require('fs');
const http  = require('http');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT        = process.env.PORT       || 3000;
const DATA_DIR    = process.env.DATA_DIR   || path.join(app.getPath('userData'), 'data');
const AGENT_TOKEN = process.env.AGENT_TOKEN || '';
const isDev       = !app.isPackaged;

// Root of the bundled app (works both in dev and packaged .exe)
const APP_ROOT = isDev
  ? path.join(__dirname, '..')
  : path.join(process.resourcesPath, 'app');

// node_modules lives alongside the app in both dev and packaged mode
const NODE_MODULES = path.join(APP_ROOT, 'node_modules');

// Use node_modules/next/dist/bin/next (JS file) — NOT .bin/next which is a bash shim.
const NEXT_BIN    = path.join(NODE_MODULES, 'next', 'dist', 'bin', 'next');
const AGENT_SCRIPT = path.join(APP_ROOT, 'print-agent.js');
const SUMATRA = path.join(APP_ROOT, 'SumatraPDF.exe');
const ICON_PATH = path.join(__dirname, 'tray-icon.png');

// Use the system Node.js to spawn child processes.
// process.execPath inside Electron is the Electron binary itself, not node.exe.
// We resolve the real node.exe from PATH.
function findNode() {
  // In a packaged app, node is bundled alongside; in dev it's on PATH.
  const candidates = [
    process.env.NODE_PATH,
    'node', // rely on PATH
  ].filter(Boolean);
  // Quick test: if process.execPath is actually node (dev with electron binary on PATH)
  if (!app.isPackaged) return process.execPath.includes('electron') ? 'node' : process.execPath;
  return 'node';
}
const NODE_BIN = findNode();

// ─── State ────────────────────────────────────────────────────────────────────
let tray        = null;
let nextProc    = null;
let agentProc   = null;
let serverReady = false;
let quitting    = false;

// ─── Logging ──────────────────────────────────────────────────────────────────
const logDir  = path.join(app.getPath('userData'), 'logs');
fs.mkdirSync(logDir, { recursive: true });
const logFile = fs.createWriteStream(path.join(logDir, 'krishna-hub.log'), { flags: 'a' });
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  logFile.write(line + '\n');
}

// ─── Start Next.js production server ──────────────────────────────────────────
function startNextServer() {
  log('Starting Next.js server on port', PORT);
  const env = {
    ...process.env,
    NODE_ENV:      'production',
    PORT:          String(PORT),
    DATA_DIR,
    LOCAL_DB_MODE: 'true',
    LOCAL_OPERATOR_MODE: 'true',
    HOSTNAME:      '127.0.0.1',
  };

  // Use system node to run next start (next/dist/bin/next is a plain JS file)
  nextProc = spawn(
    NODE_BIN,
    [NEXT_BIN, 'start', '--hostname', '127.0.0.1', '--port', String(PORT)],
    { cwd: APP_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  nextProc.stdout.on('data', d => log('[next]', d.toString().trim()));
  nextProc.stderr.on('data', d => log('[next:err]', d.toString().trim()));
  nextProc.on('exit', code => {
    log('Next.js exited with code', code);
    if (!quitting) showError('Next.js server stopped unexpectedly (code ' + code + ').');
  });
}

// ─── Start print agent ────────────────────────────────────────────────────────
function startAgent() {
  if (!AGENT_TOKEN || AGENT_TOKEN.length < 32) {
    log('AGENT_TOKEN not configured — print agent will not start.');
    return;
  }
  if (!fs.existsSync(AGENT_SCRIPT)) {
    log('print-agent.js not found — skipping agent.');
    return;
  }
  log('Starting print agent');
  const env = {
    ...process.env,
    AGENT_TOKEN,
    BACKEND_URL:   `http://127.0.0.1:${PORT}`,
    DATA_DIR:      path.join(DATA_DIR, 'agent'),
    SUMATRA_PATH:  SUMATRA,
  };
  // Use spawn with system node — fork() would use Electron's process.execPath
  agentProc = spawn(NODE_BIN, [AGENT_SCRIPT], { cwd: APP_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  agentProc.stdout?.on('data', d => log('[agent]', d.toString().trim()));
  agentProc.stderr?.on('data', d => log('[agent:err]', d.toString().trim()));
  agentProc.on('exit', code => {
    log('Print agent exited with code', code);
  });
}

// ─── Poll until Next.js is ready ─────────────────────────────────────────────
function waitForServer(retries = 40, interval = 1500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/config`, res => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) { resolve(); }
        else { retry(); }
      });
      req.on('error', retry);
      req.setTimeout(1000, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (++attempts >= retries) return reject(new Error('Server did not start in time'));
      setTimeout(check, interval);
    };
    check();
  });
}

// ─── System tray ─────────────────────────────────────────────────────────────
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => shell.openExternal(`http://127.0.0.1:${PORT}/shop`),
    },
    {
      label: 'Open Storefront',
      click: () => shell.openExternal(`http://127.0.0.1:${PORT}`),
    },
    { type: 'separator' },
    {
      label: 'View Logs',
      click: () => shell.showItemInFolder(path.join(logDir, 'krishna-hub.log')),
    },
    {
      label: serverReady ? '● Server running' : '○ Server starting…',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit Krishna Print Hub',
      click: () => { quitting = true; app.quit(); },
    },
  ]);
}

function setupTray() {
  const icon = nativeImage.createFromPath(ICON_PATH);
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Krishna Print Hub');
  tray.setContextMenu(buildTrayMenu());
  tray.on('double-click', () => shell.openExternal(`http://127.0.0.1:${PORT}/shop`));
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function showError(msg) {
  dialog.showErrorBox('Krishna Print Hub', msg);
}

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.setAppUserModelId('com.krishnaprintHub');

// Prevent second instance
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  // If someone tries to open a second instance, just open the dashboard
  shell.openExternal(`http://127.0.0.1:${PORT}/shop`);
});

// Don't show a dock icon on macOS (tray only)
if (process.platform === 'darwin') app.dock?.hide();

// Don't quit when all windows are closed — we live in the tray
app.on('window-all-closed', e => e.preventDefault());

app.whenReady().then(async () => {
  log('Electron ready — app version', app.getVersion());

  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true });

  // Set up tray immediately so the user sees something
  setupTray();

  // Start services
  startNextServer();

  // Wait for Next.js to be ready before opening the browser
  log('Waiting for Next.js server to become ready…');
  try {
    await waitForServer();
    serverReady = true;
    refreshTray();
    log('Server ready — opening dashboard');
    startAgent();
    // Open the dashboard automatically on first launch
    shell.openExternal(`http://127.0.0.1:${PORT}/shop`);
  } catch (err) {
    log('Server startup failed:', err.message);
    showError('Krishna Print Hub failed to start.\n\nCheck logs at:\n' + logDir);
  }
});

app.on('before-quit', () => {
  quitting = true;
  log('Shutting down…');
  [nextProc, agentProc].forEach(p => {
    try { p?.kill(); } catch { /* ignore */ }
  });
});
