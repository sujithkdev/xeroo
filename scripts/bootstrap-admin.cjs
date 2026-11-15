const {Client}=require('pg'),bcrypt=require('bcryptjs');
async function main(){
 const email=process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),password=process.env.BOOTSTRAP_ADMIN_PASSWORD;
 if(!email||!/^\S+@\S+\.\S+$/.test(email)||!password||password.length<14||Buffer.byteLength(password)>72)throw Error('Set BOOTSTRAP_ADMIN_EMAIL and a 14–72 byte BOOTSTRAP_ADMIN_PASSWORD in the server environment.');
 const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();
 try{await db.query('BEGIN');await db.query('SELECT pg_advisory_xact_lock(730272)');
 if((await db.query('SELECT 1 FROM users WHERE is_platform_admin')).rowCount)throw Error('An administrator already exists; no account changed.');
 await db.query('INSERT INTO users(email,name,password_hash,is_platform_admin) VALUES($1,$2,$3,true)',[email,'Platform administrator',await bcrypt.hash(password,12)]);
 await db.query('COMMIT');console.log('Administrator created. Remove the bootstrap password from your environment.');
 }catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
