const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');const path = require('path');
const dir = path.resolve(process.env.DATA_DIR || 'data');
const target = path.resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(target,{recursive:true});
const db = new DatabaseSync(path.join(dir,'print-hub.sqlite'));
db.exec('PRAGMA busy_timeout=5000');
db.prepare('VACUUM INTO ?').run(path.join(target,'print-hub.sqlite'));
db.close();
// Documents are immutable after upload. Stop the server for deletion/restore operations.
if(fs.existsSync(path.join(dir,'documents')))fs.cpSync(path.join(dir,'documents'),path.join(target,'documents'),{recursive:true});
console.log('Backup saved:',target);
