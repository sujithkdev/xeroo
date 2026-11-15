import crypto from 'node:crypto';
import {withTransaction,queryOne} from './db/client';
import {RESERVED_SUBDOMAINS} from './tenancy';
import {hashPassword,verifyPassword,validatePasswordStrength} from './auth/passwords';
const hash=(s:string)=>crypto.createHash('sha256').update(s).digest('hex');
export async function onboardShop(input:any,actor:string){
 const name=String(input.name||'').trim(),slug=String(input.subdomain||'').trim().toLowerCase(),email=String(input.ownerEmail||'').trim().toLowerCase();
 if(name.length<2||name.length>120||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)throw Error('Enter a shop name and valid owner email.');
 if(!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)||RESERVED_SUBDOMAINS.has(slug))throw Error('Choose an unreserved subdomain of 3–63 characters.');
 const rate=Number(input.a4Price);if(!Number.isFinite(rate)||rate<1||rate>10000)throw Error('Enter a valid A4 black-and-white price.');
 const token=crypto.randomBytes(32).toString('hex');
 return withTransaction(async c=>{
 const shop=(await c.query("INSERT INTO shops(name,subdomain,status,address,phone,email) VALUES($1,$2,'testing',$3,$4,$5) RETURNING *",[name,slug,String(input.address||'').slice(0,500),String(input.phone||'').slice(0,30),email])).rows[0];
 await c.query('INSERT INTO shop_settings(shop_id,tagline,accepting_orders,auto_print_enabled) VALUES($1,$2,false,false)',[shop.id,String(input.tagline||'').slice(0,200)]);
 await c.query("INSERT INTO print_rules(shop_id,allowed_paper_sizes,allowed_color_modes,allowed_finishing) VALUES($1,ARRAY['A4'],ARRAY['bw'],ARRAY['none'])",[shop.id]);
 await c.query("INSERT INTO service_prices(shop_id,key,paise) VALUES($1,'A4_BW',$2)",[shop.id,Math.round(rate*100)]);
 await c.query("INSERT INTO invitations(shop_id,email,role,token_hash,invited_by,expires_at) VALUES($1,$2,'owner',$3,$4,now()+interval '48 hours')",[shop.id,email,hash(token),actor]);
 return {shop,token};
 });
}
export async function invitationInfo(token:string,shopId:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw Error('Invalid invitation.');
 const row=await queryOne<any>('SELECT i.email,i.role,i.expires_at,s.name FROM invitations i JOIN shops s ON s.id=i.shop_id WHERE i.token_hash=$1 AND i.shop_id=$2 AND i.accepted_at IS NULL AND i.expires_at>now()',[hash(token),shopId]);
 if(!row)throw Error('Invitation is invalid, expired or already used.');return row;
}
export async function acceptOwner(token:string,shopId:string,input:any){
 await invitationInfo(token,shopId);
 const error=validatePasswordStrength(input.password);if(error)throw Error(error);
 const name=String(input.name||'').trim();if(name.length<2||name.length>100)throw Error('Enter your name.');
 const passwordHash=await hashPassword(input.password);
 return withTransaction(async c=>{
 const invite=(await c.query("SELECT * FROM invitations WHERE token_hash=$1 AND shop_id=$2 AND role='owner' AND accepted_at IS NULL AND expires_at>now() FOR UPDATE",[hash(token),shopId])).rows[0];if(!invite)throw Error('Invitation is invalid, expired or already used.');
 let user=(await c.query('SELECT id,password_hash,is_suspended FROM users WHERE lower(email)=lower($1) FOR UPDATE',[invite.email])).rows[0];
 if(user){if(user.is_suspended||!user.password_hash||!await verifyPassword(input.password,user.password_hash))throw Error('An account already exists. Enter its current password to join; credentials will not be changed.');}
 else user=(await c.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[invite.email,name,passwordHash])).rows[0];
 await c.query("INSERT INTO shop_memberships(shop_id,user_id,role,invited_by,joined_at) VALUES($1,$2,'owner',$3,now())",[shopId,user.id,invite.invited_by]);
 await c.query('UPDATE invitations SET accepted_at=now() WHERE id=$1',[invite.id]);return {success:true};
 });
}

/** Accept a manager or staff invitation.
 *
 *  Unlike acceptOwner, this handles two cases:
 *  1. The invitee already has an account — they just join the shop, no password change.
 *  2. The invitee is new — a new user account is created with the supplied password.
 *
 *  In both cases the invitation is consumed and a shop_membership row is created.
 */
export async function acceptStaffInvite(token:string,shopId:string,input:any){
 const invite=await invitationInfo(token,shopId);
 if(invite.role==='owner')return acceptOwner(token,shopId,input);// delegate owner path
 if(!['manager','staff'].includes(invite.role))throw Error('Invalid invitation role.');
 return withTransaction(async c=>{
  const row=(await c.query("SELECT * FROM invitations WHERE token_hash=$1 AND shop_id=$2 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE",[hash(token),shopId])).rows[0];
  if(!row)throw Error('Invitation is invalid, expired or already used.');
  // Find or create the user account.
  let user=(await c.query('SELECT id,is_suspended FROM users WHERE lower(email)=lower($1) FOR UPDATE',[row.email])).rows[0];
  if(user){
   if(user.is_suspended)throw Error('Your account is suspended. Contact the platform administrator.');
   // Existing user: verify their password so they can link the account deliberately.
   const {verifyPassword}=await import('./auth/passwords');
   if(typeof input.password!=='string'||!input.password)throw Error('Enter your existing account password.');
   {
    const pwRow=(await c.query('SELECT password_hash FROM users WHERE id=$1',[user.id])).rows[0];
    if(!pwRow?.password_hash||!await verifyPassword(input.password,pwRow.password_hash))throw Error('That is not the correct password for this account. Enter your existing password to join.');
   }
  } else {
   // New user: require name and password.
   const {hashPassword,validatePasswordStrength}=await import('./auth/passwords');
   const pwError=validatePasswordStrength(input.password);if(pwError)throw Error(pwError);
   const name=String(input.name||'').trim();if(name.length<2||name.length>100)throw Error('Enter your name (2–100 characters).');
   const passwordHash=await hashPassword(input.password);
   user=(await c.query('INSERT INTO users(email,name,password_hash) VALUES($1,$2,$3) RETURNING id',[row.email,name,passwordHash])).rows[0];
  }
  // Create or update membership (member may have been removed before and re-invited).
  await c.query(`INSERT INTO shop_memberships(shop_id,user_id,role,invited_by,joined_at)
   VALUES($1,$2,$3,$4,now())
   ON CONFLICT(shop_id,user_id) DO UPDATE SET role=$3,joined_at=now()`,[shopId,user.id,row.role,row.invited_by]);
  await c.query('UPDATE invitations SET accepted_at=now() WHERE id=$1',[row.id]);
  return {success:true,role:row.role};
 });
}
