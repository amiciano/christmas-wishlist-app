import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// Run the actual API in an isolated Worker and temporary D1 database.
// This never connects to the preview or changes the family's records.
const bundle=await build({stdin:{contents:"import { GET, POST } from './app/api/[[...path]]/route.ts'; export default {fetch:request=>request.method==='GET'?GET(request):POST(request)}",resolveDir:process.cwd(),sourcefile:'test-worker.ts'},bundle:true,format:'esm',platform:'neutral',external:['cloudflare:workers'],write:false});
const mf=new Miniflare({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-05-15',d1Databases:['DB'],bindings:{SETUP_KEY:'test-only'},cf:false});
let checks=0;
try{
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const sql of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(sql).run();
 async function call(path,data,cookie='',status=200){
  const r=await mf.dispatchFetch('https://test.local/api/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:'https://test.local',Cookie:cookie,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});
  const value=await r.json();assert.equal(r.status,status,`${path}: ${JSON.stringify(value)}`);checks++;
  return {value,cookie:r.headers.get('set-cookie')?.split(';')[0]||cookie};
 }
 const admin=await call('setup',{setupKey:'test-only',username:'admin',name:'Alex Miciano',password:'a'});
 await call('members',{name:'Sam Miciano',username:'sam',password:'x'},admin.cookie);
 let sam=await call('login',{username:'sam',password:'x'});
 assert.equal('mustChange' in sam.value.member,false);checks++;
 await call('wishes',undefined,sam.cookie);
 const id=sam.value.member.id;
 await db.prepare('UPDATE members SET must_change=1 WHERE id=?').bind(id).run();
 sam=await call('login',{username:'sam',password:'x'});
 await call('wishes',undefined,sam.cookie);
 await call('members',{id,name:'Samuel Miciano',username:'samuel'},admin.cookie);
 assert.equal((await call('me',undefined,sam.cookie)).value.member.name,'Samuel Miciano');checks++;
 await call('login',{username:'samuel',password:'x'});
 await call('members',{id,name:'Sam',username:'samuel',password:''},admin.cookie);
 await call('wishes',undefined,sam.cookie,401);
 sam=await call('login',{username:'samuel',password:''});
 const longPassword='z'.repeat(200);
 await call('members',{id,name:'Sam',username:'samuel',password:longPassword},admin.cookie);
 sam=await call('login',{username:'samuel',password:longPassword});
 await call('members',{id,name:'Sam',username:'admin'},admin.cookie,409);
 await call('members',{id,name:'Unauthorized',username:'samuel',password:'q'},sam.cookie,403);
 await call('members',{id:admin.value.member.id,name:'Alexandra Miciano',username:'admin',password:'a'},admin.cookie);
 assert.equal((await call('me',undefined,admin.cookie)).value.member.name,'Alexandra Miciano');checks++;
 await call('members',{name:'Jordan',username:'jordan',password:'j'},admin.cookie);
 const jordan=await call('login',{username:'jordan',password:'j'});
 await call('wishes/save',{title:'Coffee mug'},sam.cookie);
 const before=(await call('wishes',undefined,sam.cookie)).value;
 const wish=before[0];
 await call('wishes/save',{id:wish.id,title:'Wrong owner'},admin.cookie,404);
 const race=await Promise.all([admin,jordan].map(b=>mf.dispatchFetch('https://test.local/api/wishes/buy',{method:'POST',headers:{Origin:'https://test.local','Content-Type':'application/json',Cookie:b.cookie},body:JSON.stringify({id:wish.id})})));
 assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);checks++;
 assert.deepEqual((await call('wishes',undefined,sam.cookie)).value,before);checks++;
 const other=(await call('wishes?member='+id,undefined,admin.cookie)).value[0];
 assert.equal(other.bought,1);assert.equal('buyer_id' in other,false);checks+=2;
 await call('wishes/save',{title:'Book'},sam.cookie);
 await call('wishes/save',{title:'Scarf'},sam.cookie);
 const initial=(await call('wishes',undefined,sam.cookie)).value;
 const order=initial.map(w=>w.id).reverse();
 await call('wishes/reorder',{ids:order},sam.cookie);
 const saved=(await call('wishes',undefined,sam.cookie)).value;
 assert.deepEqual(saved.map(w=>w.id),order);assert.ok(saved.every(w=>!('bought' in w)&&!('canUndo' in w)));checks+=2;
 assert.deepEqual((await call('wishes?member='+id,undefined,admin.cookie)).value.map(w=>w.id),order);checks++;
 await call('wishes/reorder',{ids:order},admin.cookie,409);
 await call('wishes/reorder',{ids:[order[0],order[0]]},sam.cookie,400);
 await call('wishes/reorder',{ids:order.slice(1)},sam.cookie,409);
 await call('wishes/reorder',{ids:[...order.slice(1),'unknown']},sam.cookie,409);
 assert.deepEqual((await call('wishes',undefined,sam.cookie)).value.map(w=>w.id),order);checks++;
 assert.equal((await call('wishes?member='+id,undefined,admin.cookie)).value.find(w=>w.id===wish.id).bought,1);checks++;
 await call('wishes/save',{title:'New item'},sam.cookie);
 await call('wishes/reorder',{ids:order},sam.cookie,409);
 const extended=(await call('wishes',undefined,sam.cookie)).value;
 assert.equal(extended[0].title,'New item');assert.deepEqual(extended.slice(1).map(w=>w.id),order);checks+=2;
 await call('logout',{},sam.cookie);await call('wishes',undefined,sam.cookie,401);
 console.log(`Passed ${checks} checks: unrestricted assigned passwords, no forced changes (including legacy accounts), account edits, session invalidation, administrator access, gift privacy, and purchase races.`);
}finally{await mf.dispose();}
