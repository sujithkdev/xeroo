# Krishna Print Hub — Electron Desktop App

## Running in development

```bat
npm run electron:dev
```

This starts the Next.js dev server and Electron simultaneously.
The tray icon appears once the server is ready (~30s first run).

## Building the installer (.exe)

```bat
npm run build           # Build Next.js production bundle first
npm run electron:build  # Package into dist-electron/Krishna Print Hub Setup.exe
```

The output installer is in `dist-electron/`.

## Configuration

Set these environment variables before running (or in a `.env.local` file):

| Variable | Required | Description |
|---|---|---|
| `AGENT_TOKEN` | Yes (for printing) | 64-char hex token — run `npm run setup` to generate |
| `PORT` | No | Web server port, default `3000` |
| `DATA_DIR` | No | Where SQLite DB is stored, default `%APPDATA%\Krishna Print Hub\data` |

## Architecture

```
KrishnaPrintHub.exe (Electron)
  ├── electron/main.js     ← Electron main process
  ├── Next.js server       ← Spawned as child process on port 3000
  │     └── .build/        ← Compiled Next.js app
  └── Print agent          ← Forked as child process, polls for jobs
        └── print-agent.js
```

## Logs

Logs are written to:
`%APPDATA%\Krishna Print Hub\logs\krishna-hub.log`

Right-click the tray icon → "View Logs" to open the log file location.
