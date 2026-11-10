import { env } from 'cloudflare:workers';
type Member = {id:string;username:string;name:string;admin:number;password:string};
const encoder = new TextEncoder();
const hex = (bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const random = ()=>hex(crypto.getRandomValues(new Uint8Array(32)).buffer);
async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
async function hashPassword(password:string,salt=random()){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return salt+':'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encoder.encode(salt),iterations:100000,hash:'SHA-256'},key,256));
}
function equal(a:string,b:string){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
function fail(message:string,status=400):never{throw Object.assign(new Error(message),{status});}
function field(data:Record<string,unknown>,key:string,max:number,required=false){const v=typeof data[key]==='string'?(data[key] as string).trim():'';if(v.length>max || (required&&!v))fail(`Check ${key}.`);return v;}
// Passwords are assigned by the administrator, with no length or complexity rules.
function passwordField(data:Record<string,unknown>){if(typeof data.password!=='string')fail('Password must be text.');return data.password;}
function publicMember(m:Member){return {id:m.id,username:m.username,name:m.name,admin:!!m.admin};}
async function handle(req:Request){
 const db=env.DB!; const url=new URL(req.url); const route=url.pathname.replace(/^\/api\/?/,'');
 const json=(value:unknown,status=200,extra:Record<string,string>={})=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
 const secure=url.protocol==='https:'?'; Secure':'';
 const cookie=(token:string,age=604800)=>`family_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure}`;
 try{
  if(req.method!=='GET'&&req.headers.get('origin')!==url.origin)fail('Please reload and try again.',403);
  const raw=req.headers.get('cookie')?.match(/(?:^|; )family_session=([^;]+)/)?.[1];
  const tokenHash=raw?await digest(raw):'';
  const member=tokenHash?await db.prepare('SELECT m.* FROM members m JOIN sessions s ON s.member_id=m.id WHERE s.token=? AND s.expires>?').bind(tokenHash,Date.now()).first<Member>():null;
  if(req.method==='GET'){
   if(route==='me')return json({member:member?publicMember(member):null});
   if(!member)fail('Please log in.',401);
   if(route==='members')return json((await db.prepare('SELECT id,name,username FROM members ORDER BY name COLLATE NOCASE').all()).results);
   if(route==='wishes'){
    const owner=url.searchParams.get('member')||member.id;
    // Purchase data is never selected for the recipient, including administrators.
    if(owner===member.id)return json((await db.prepare('SELECT id,title,url,notes,price,created FROM wishes WHERE member_id=? ORDER BY sort_order,created DESC,id').bind(owner).all()).results);
    return json((await db.prepare('SELECT w.id,w.title,w.url,w.notes,w.price,w.created, p.wish_id IS NOT NULL AS bought, p.buyer_id=? AS canUndo FROM wishes w LEFT JOIN purchases p ON p.wish_id=w.id WHERE w.member_id=? ORDER BY w.sort_order,w.created DESC,w.id').bind(member.id,owner).all()).results);
   }
   fail('Not found.',404);
  }
  if(req.method!=='POST')fail('Not allowed.',405);
  if(Number(req.headers.get('content-length')||0)>16000)fail('Request too large.',413);
  const text=await req.text();if(text.length>16000)fail('Request too large.',413);
  let data:Record<string,unknown>;try{data=JSON.parse(text)}catch{fail('Invalid request.');}
  if(!data||typeof data!=='object'||Array.isArray(data))fail('Invalid request.');
  if(route==='login'||route==='setup'){
   const username=field(data,'username',32,true).toLowerCase();
   const key=await digest(username+':'+(req.headers.get('cf-connecting-ip')||'local'));
   await db.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END, expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END').bind(key,Date.now()+900000,Date.now(),Date.now()).run();
   const attempt=await db.prepare('SELECT count FROM attempts WHERE key=?').bind(key).first<{count:number}>();
   if(attempt!.count>10)fail('Too many attempts. Try again in 15 minutes.',429);
   if(route==='setup'){
    const setupKey=(env as unknown as {SETUP_KEY?:string}).SETUP_KEY;
    if(!setupKey||!equal(String(data.setupKey||''),setupKey))fail('Invalid setup code.',403);
    if(!/^[a-z0-9._-]{2,32}$/.test(username))fail('Use 2–32 letters, numbers, dots, dashes or underscores for the username.');
    const result=await db.prepare('INSERT INTO members(id,username,name,password,admin,must_change) SELECT ?,?,?,?,1,0 WHERE NOT EXISTS(SELECT 1 FROM members)').bind(crypto.randomUUID(),username,field(data,'name',60,true),await hashPassword(passwordField(data))).run();
    if(!result.meta.changes)fail('Setup is already complete.',409);
   }
   const user=await db.prepare('SELECT * FROM members WHERE username=?').bind(username).first<Member>();
   const incoming=passwordField(data);
   const hashed=await hashPassword(incoming,user?.password.split(':')[0]||'dummy-salt-for-unknown-user');
   if(!user||!equal(hashed,user.password))fail('Incorrect username or password.',401);
   const session=random();
   await db.batch([db.prepare('DELETE FROM attempts WHERE key=? OR expires<?').bind(key,Date.now()),db.prepare('DELETE FROM sessions WHERE expires<?').bind(Date.now()),db.prepare('INSERT INTO sessions(token,member_id,expires) VALUES(?,?,?)').bind(await digest(session),user.id,Date.now()+604800000)]);
   return json({member:publicMember(user)},200,{'Set-Cookie':cookie(session)});
  }
  if(!member)fail('Please log in.',401);
  if(route==='logout'){await db.prepare('DELETE FROM sessions WHERE token=?').bind(tokenHash).run();return json({ok:true},200,{'Set-Cookie':cookie('',0)});}
  if(route==='members'){
   if(!member.admin)fail('Not allowed.',403);
   const username=field(data,'username',32,true).toLowerCase();if(!/^[a-z0-9._-]{2,32}$/.test(username))fail('Use 2–32 letters, numbers, dots, dashes or underscores for the username.');
   const name=field(data,'name',60,true);
   if(data.id){
    const id=field(data,'id',64,true);
    const existing=await db.prepare('SELECT id FROM members WHERE id=?').bind(id).first();
    if(!existing)fail('Account not found.',404);
    const password=Object.hasOwn(data,'password')?await hashPassword(passwordField(data)):null;
    // Keep the current administrator signed in when editing their own account.
    const operations=[db.prepare('UPDATE members SET name=?,username=?,password=COALESCE(?,password),must_change=0 WHERE id=?').bind(name,username,password,id)];
    if(password!==null)operations.push(db.prepare('DELETE FROM sessions WHERE member_id=? AND token<>?').bind(id,tokenHash));
    try{await db.batch(operations);}catch(e){if(String(e).includes('UNIQUE constraint'))fail('That username is already taken.',409);throw e;}
    return json({ok:true});
   }
   const result=await db.prepare('INSERT INTO members(id,username,name,password,must_change) VALUES(?,?,?,?,0) ON CONFLICT(username) DO NOTHING').bind(crypto.randomUUID(),username,name,await hashPassword(passwordField(data))).run();
   if(!result.meta.changes)fail('That username is already taken.',409);return json({ok:true});
  }
  if(route==='wishes/reorder'){
   const ids=data.ids;
   if(!Array.isArray(ids)||!ids.length||ids.some(id=>typeof id!=='string'||id.length>64)||new Set(ids).size!==ids.length)fail('Invalid item order.');
   // Validate membership and the complete list in the same atomic update.
   const result=await db.prepare(`WITH ordering AS (SELECT value AS id, CAST(key AS INTEGER) AS position FROM json_each(?))
    UPDATE wishes SET sort_order=(SELECT position FROM ordering WHERE ordering.id=wishes.id)
    WHERE member_id=?
      AND (SELECT COUNT(*) FROM wishes WHERE member_id=?)=(SELECT COUNT(*) FROM ordering)
      AND NOT EXISTS(SELECT 1 FROM ordering o LEFT JOIN wishes w ON w.id=o.id AND w.member_id=? WHERE w.id IS NULL)`)
    .bind(JSON.stringify(ids),member.id,member.id,member.id).run();
   if(result.meta.changes!==ids.length)fail('Your list has changed. Please try again.',409);
   return json({ok:true});
  }
  if(route==='wishes/save'){
   const title=field(data,'title',120,true),notes=field(data,'notes',1200),price=field(data,'price',40),link=field(data,'url',2000);
   if(link){try{const u=new URL(link);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail('Use a valid http or https link.');}catch{fail('Use a valid http or https link.');}}
   if(data.id){const result=await db.prepare('UPDATE wishes SET title=?,url=?,notes=?,price=? WHERE id=? AND member_id=?').bind(title,link,notes,price,field(data,'id',64,true),member.id).run();if(!result.meta.changes)fail('Item not found.',404);}
   else await db.prepare('INSERT INTO wishes(id,member_id,title,url,notes,price,created,sort_order) VALUES(?,?,?,?,?,?,?,(SELECT COALESCE(MIN(sort_order),0)-1 FROM wishes WHERE member_id=?))').bind(crypto.randomUUID(),member.id,title,link,notes,price,Date.now(),member.id).run();
   return json({ok:true});
  }
  const id=field(data,'id',64,true);
  if(route==='wishes/delete'){const result=await db.prepare('DELETE FROM wishes WHERE id=? AND member_id=?').bind(id,member.id).run();if(!result.meta.changes)fail('Item not found.',404);return json({ok:true});}
  if(route==='wishes/buy'){
   const result=await db.prepare('INSERT INTO purchases(wish_id,buyer_id) SELECT id,? FROM wishes WHERE id=? AND member_id<>? ON CONFLICT(wish_id) DO NOTHING').bind(member.id,id,member.id).run();
   if(!result.meta.changes)fail('This item is no longer available. The list has been refreshed.',409);return json({ok:true});
  }
  if(route==='wishes/undo'){const result=await db.prepare('DELETE FROM purchases WHERE wish_id=? AND buyer_id=?').bind(id,member.id).run();if(!result.meta.changes)fail('Only the buyer can undo this.',403);return json({ok:true});}
  fail('Not found.',404);
 }catch(error){const e=error as Error&{status?:number};if(!e.status)console.error('Request failed',e.message);return json({error:e.status?e.message:'Something went wrong. Please try again.'},e.status||500);}
}
export const GET=handle;
export const POST=handle;
