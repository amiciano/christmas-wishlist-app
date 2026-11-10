import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw new Error('Run these tests only against a local test database.');
const password='Local-test-password-2026';
let checks=0;
async function call(path,data,cookie='',expected=200){
 const response=await fetch(origin+'/api/'+path,{method:data===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:data===undefined?undefined:JSON.stringify(data)});
 const result=await response.json();assert.equal(response.status,expected,`${path}: ${JSON.stringify(result)}`);checks++;
 return {data:result,cookie:response.headers.get('set-cookie')?.split(';')[0]||cookie,headers:response.headers};
}
const setup=await fetch(origin+'/api/setup',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({setupKey:'local-test-setup-only',name:'Alex',username:'qa_admin',password})});
assert.ok([200,409].includes(setup.status),await setup.text());
const admin=await call('login',{username:'qa_admin',password});
assert.match(admin.headers.get('set-cookie'),/HttpOnly/);assert.match(admin.headers.get('set-cookie'),/SameSite=Strict/);checks+=2;
const adminId=admin.data.member.id, suffix=Date.now().toString(36);
await call('wishes',undefined,'',401);
await call('login',{username:'qa_admin',password:'wrong'},'',401);
async function create(name){
 const username=name.toLowerCase()+'_'+suffix;
 await call('members',{name,username,password},admin.cookie);
 const account=await call('login',{username,password});
 assert.equal('mustChange' in account.data.member,false);checks++;
 await call('wishes',undefined,account.cookie);
 return {...account,id:account.data.member.id};
}
const sam=await create('Sam'),jordan=await create('Jordan');
await call('members',{name:'Forbidden',username:'forbidden',password},sam.cookie,403);
await call('wishes/save',{title:'Ceramic coffee mug',notes:'Olive green, please.',price:'$24',url:'https://example.com/mug'},admin.cookie);
let list=await call('wishes',undefined,admin.cookie);const wish=list.data[0];
const before=JSON.stringify(list.data);
await call('wishes/buy',{id:wish.id},admin.cookie,409);
await call('wishes/save',{id:wish.id,title:'Unauthorized edit'},sam.cookie,404);
await call('wishes/delete',{id:wish.id},sam.cookie,404);
const race=await Promise.all([sam,jordan].map(async buyer=>{
 const r=await fetch(origin+'/api/wishes/buy',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:buyer.cookie},body:JSON.stringify({id:wish.id})});return {buyer,status:r.status};
}));
assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);checks++;
const winner=race.find(r=>r.status===200).buyer,loser=race.find(r=>r.status===409).buyer;
list=await call('wishes',undefined,admin.cookie);
assert.equal(JSON.stringify(list.data),before,'Recipient response must not change when purchased');checks++;
for(const member of [sam,jordan]){
 const view=await call('wishes?member='+adminId,undefined,member.cookie);
 const purchased=view.data.find(w=>w.id===wish.id);assert.equal(purchased.bought,1);assert.equal(purchased.canUndo,member.id===winner.id?1:0);assert.equal('buyer_id' in purchased,false);assert.equal('buyerName' in purchased,false);checks+=4;
}
await call('wishes/undo',{id:wish.id},loser.cookie,403);
await call('wishes/undo',{id:wish.id},winner.cookie);
await call('wishes/save',{id:wish.id,title:'Stoneware coffee mug',price:'$28'},admin.cookie);
await call('wishes/save',{title:'Bad link',url:'javascript:alert(1)'},admin.cookie,400);
const csrf=await fetch(origin+'/api/wishes/save',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json',Cookie:admin.cookie},body:JSON.stringify({title:'CSRF'})});assert.equal(csrf.status,403);checks++;
await call('wishes/delete',{id:wish.id},admin.cookie);
const after=await call('wishes',undefined,admin.cookie);assert.ok(!after.data.some(w=>w.id===wish.id));checks++;
// Representative local-only content for visual QA; never seeded into production.
for(const item of [{title:'Wool scarf',notes:'Dark green or charcoal.',price:'$45'},{title:'A good cookbook',notes:'Vegetarian recipes would be nice.',price:'$30'},{title:'Coffee beans',notes:'Whole bean, medium roast.',price:'$18'}])await call('wishes/save',item,admin.cookie);
await call('wishes/save',{title:'Ceramic coffee mug',notes:'Something big enough for a morning coffee.',price:'$24',url:'https://example.com'},sam.cookie);
const samList=await call('wishes?member='+sam.id,undefined,admin.cookie);
await call('wishes/buy',{id:samList.data[0].id},jordan.cookie);
await call('logout',{},sam.cookie);await call('wishes',undefined,sam.cookie,401);
console.log(`Passed ${checks} checks: authentication, assigned passwords, authorization, recipient privacy, atomic purchases, undo, CRUD, link validation, CSRF, and logout.`);
