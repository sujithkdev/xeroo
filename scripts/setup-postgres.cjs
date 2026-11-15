const fs = require('node:fs');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const envFile = '.env.multishop.local';
if (fs.existsSync(envFile)) throw Error('Existing .env.multishop.local preserved. Use docker start print-hub-postgres to restart its container.');
const password = crypto.randomBytes(32).toString('hex');
fs.writeFileSync(envFile, `DATABASE_URL=postgresql://print_hub:${password}@127.0.0.1:55432/print_hub_dev\nAPP_DOMAIN=print.localhost\nLOCAL_DB_MODE=false\nLOCAL_OPERATOR_MODE=false\nDATA_DIR=.test-data/multishop\n`, { flag: 'wx', mode: 0o600 });
const dockerEnv = '.env.postgres.local';
fs.writeFileSync(dockerEnv, `POSTGRES_USER=print_hub\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=print_hub_dev\n`, { flag: 'wx', mode: 0o600 });
const r = spawnSync('docker', ['run','--detach','--name','print-hub-postgres','--publish','127.0.0.1:55432:5432','--env-file',dockerEnv,'--volume','print-hub-postgres-data:/var/lib/postgresql/data','--health-cmd','pg_isready -U print_hub -d print_hub_dev','--health-interval','5s','--health-retries','12','postgres:17'], { stdio: 'inherit', windowsHide: true });
if (r.status !== 0) { console.error('Docker setup failed. Configuration files preserved for recovery.'); process.exitCode = 1; }
else console.log('PostgreSQL starts on loopback port 55432. Credentials saved locally; existing SQLite configuration unchanged.');
