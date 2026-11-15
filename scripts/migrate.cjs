const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
async function migrate(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw Error('DATABASE_URL is required.');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('SELECT pg_advisory_lock(730271)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    for (const file of fs.readdirSync(path.resolve('migrations')).filter(f => /^\d+.*\.sql$/.test(f)).sort()) {
      const version = file.replace(/\.sql$/, '');
      if ((await client.query('SELECT 1 FROM schema_migrations WHERE version=$1', [version])).rowCount) continue;
      await client.query(fs.readFileSync(path.join('migrations', file), 'utf8'));
      console.log('Applied migration', version);
    }
  } finally { await client.end(); }
}
module.exports = { migrate };
if (require.main === module) migrate().catch(e => { console.error('Migration failed:', e.code || e.message); process.exitCode = 1; });
