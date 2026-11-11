'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, ExternalLink, Gift, LogOut, Plus, Settings, Menu, X } from 'lucide-react';
import { useWishReorder } from './use-wish-reorder';
type Member={id:string;name:string;username:string;admin?:boolean};
type Wish={id:string;title:string;url:string;notes:string;price:string;photo?:string;bought?:number;canUndo?:number};
type Modal={kind:'wish';wish?:Wish}|{kind:'member';member?:Member}|{kind:'delete';wish:Wish}|null;
async function api<T = {member:Member}>(path:string,data?:unknown):Promise<T>{
 const response=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data),cache:'no-store'});
 const result=await response.json() as T & {error?:string};if(!response.ok)throw Object.assign(new Error(result.error||'Please try again.'),{status:response.status});return result;
}
const values=(form:HTMLFormElement)=>Object.fromEntries(new FormData(form));
async function preparePhoto(file:File):Promise<string>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Choose a JPG, PNG, or WebP photo.');
 if(file.size>20000000)throw new Error('Choose a photo smaller than 20 MB.');
 const source=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=source;
  try{await image.decode()}catch{throw new Error('This photo could not be opened. Choose another photo.');}
  const canvas=document.createElement('canvas');
  const scale=Math.min(1,800/Math.max(image.naturalWidth,image.naturalHeight));
  canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('Photo processing is unavailable.');
  context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  for(const quality of [0.8,0.65,0.45,0.25]){const photo=canvas.toDataURL('image/jpeg',quality);if(photo.length<=180000)return photo;}
  throw new Error('This photo is too detailed. Try a smaller photo.');
 }finally{URL.revokeObjectURL(source)}
}
export default function Home(){
 const [me,setMe]=useState<Member|null>(null),[ready,setReady]=useState(false),[family,setFamily]=useState<Member[]>([]),[selected,setSelected]=useState(''),[wishes,setWishes]=useState<Wish[]>([]);
 const [page,setPage]=useState<'lists'|'family'>('lists'),[modal,setModal]=useState<Modal>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[setup,setSetup]=useState(false);
 const [photo,setPhoto]=useState('');
 const [replacePassword,setReplacePassword]=useState(false);
 const requestNumber=useRef(0), dialog=useRef<HTMLDialogElement>(null);
 const selectedRef=useRef(selected);selectedRef.current=selected;
 const own=me?.id===selected,person=family.find(p=>p.id===selected);
 const refresh=useCallback(async(id:string,quiet=false,force=false)=>{
  if(reorder.locked.current&&!force)return;
  const n=++requestNumber.current;if(!quiet)setLoading(true);
  try{const items=await api<Wish[]>('wishes?member='+encodeURIComponent(id));if(n===requestNumber.current&&id===selectedRef.current&&(!reorder.locked.current||force))setWishes(items);}
  catch(e){if(n===requestNumber.current){setError((e as Error).message);if((e as {status?:number}).status===401)setMe(null);}}
  finally{if(n===requestNumber.current)setLoading(false);}
 },[]);
 const reorder=useWishReorder({items:wishes,setItems:setWishes,enabled:own&&!busy&&!loading&&page==='lists',save:async(next)=>{
  const owner=selected;requestNumber.current++;setBusy(true);setError('');
  try{await api('wishes/reorder',{ids:next.map(w=>w.id)});setNotice('Order saved.');}
  catch(e){setError((e as Error).message);if(selectedRef.current===owner)await refresh(owner,true,true);}
  finally{setBusy(false);}
 }});
 useEffect(()=>{setSetup(location.pathname==='/setup');api('me').then(r=>{setMe(r.member);if(r.member)setSelected(r.member.id)}).catch(e=>setError(e.message)).finally(()=>setReady(true));},[]);
 useEffect(()=>{document.title=me?'Wish lists':'Log in';if(me)api<Member[]>('members').then(setFamily).catch(e=>setError(e.message));},[me]);
 useEffect(()=>{if(!me||!selected)return;setWishes([]);refresh(selected);const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh(selected,true)},15000);const focus=()=>refresh(selected,true);window.addEventListener('focus',focus);return()=>{clearInterval(timer);window.removeEventListener('focus',focus);requestNumber.current++;};},[me,selected,refresh]);
 useEffect(()=>{if(modal)dialog.current?.showModal();else dialog.current?.close();},[modal]);
 useEffect(()=>{if(!notice)return;const t=setTimeout(()=>setNotice(''),4500);return()=>clearTimeout(t)},[notice]);
 async function login(event:React.FormEvent<HTMLFormElement>){event.preventDefault();setError('');setBusy(true);try{const result=await api(setup?'setup':'login',values(event.currentTarget));setMe(result.member);setSelected(result.member.id);if(setup){history.replaceState(null,'','/');setSetup(false)}}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function logout(){setBusy(true);try{await api('logout',{});setMe(null);setFamily([]);setWishes([]);setModal(null);setPage('lists');setError('');setNotice('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 async function save(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();const data=values(event.currentTarget);setBusy(true);setError('');
  try{
   if(modal?.kind==='wish'){await api('wishes/save',{...data,photo,id:modal.wish?.id});await refresh(selected);setNotice('Item saved.');}
   else if(modal?.kind==='member'){await api('members',{...data,id:modal.member?.id});setFamily(await api<Member[]>('members'));setMe((await api('me')).member);setNotice(modal.member?'Account saved.':'Account created.');}
   setModal(null);
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function choosePhoto(event:React.ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';if(!file)return;
  setError('');setBusy(true);
  try{setPhoto(await preparePhoto(file));}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function purchase(wish:Wish){setError('');setBusy(true);try{await api(wish.canUndo?'wishes/undo':'wishes/buy',{id:wish.id});setNotice(wish.canUndo?'Marked as available.':'Marked as bought.');}catch(e){setError((e as Error).message)}finally{await refresh(selected,true);setBusy(false)}}
 async function remove(){if(modal?.kind!=='delete')return;setBusy(true);setError('');try{await api('wishes/delete',{id:modal.wish.id});setModal(null);await refresh(selected);setNotice('Item removed.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 function open(next:Modal){setPhoto(next?.kind==='wish'?next.wish?.photo||'':'');setError('');setReplacePassword(false);setModal(next)}
 function close(){if(!busy){setModal(null);setError('')}}
 if(!ready)return <main className="login"><span className="muted" role="status">Loading…</span></main>;
 if(!me)return <main className="login"><form className="login-form" onSubmit={login}>
  {setup&&<><h1>Create your account</h1><label>Setup code<input name="setupKey" type="password" required autoComplete="off"/></label><label>Name<input name="name" autoComplete="name" required maxLength={60}/></label></>}
  <label>Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={32}/></label>
  <label>Password<input name="password" type="password" autoComplete={setup?'new-password':'current-password'} /></label>
  {error&&<p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy?'Please wait…':setup?'Create account':'Log in'}</button>
 </form></main>;
 return <div className="app">
  <header className="topbar"><div className="brand"><span className="brand-mark"><Gift size={20} strokeWidth={1.6}/></span><span>Miciano Christmas 2026</span></div><div className="user-menu"><span>{me.name}</span><button title="Log out" aria-label="Log out" className="icon-button" disabled={busy} onClick={logout}><LogOut size={18}/></button></div></header>
  <div className="shell"><aside><nav aria-label="Wish lists"><p className="nav-label">WISH LISTS</p><button className={page==='lists'&&own?'nav-item active':'nav-item'} onClick={()=>{setPage('lists');setSelected(me.id);setError('')}}><span>My list</span><ChevronRight size={16}/></button><div className="family-nav">{family.filter(p=>p.id!==me.id).map(p=><button key={p.id} className={page==='lists'&&selected===p.id?'nav-item active':'nav-item'} onClick={()=>{setPage('lists');setSelected(p.id);setError('')}}><span>{p.name}</span><ChevronRight size={16}/></button>)}</div>{me.admin&&<button className={page==='family'?'nav-item manage active':'nav-item manage'} onClick={()=>{setPage('family');setError('')}}><span>Family</span><Settings size={15}/></button>}</nav></aside>
  <main className="content">
   {page==='lists'?<><div className="page-heading"><div><p className="eyebrow">{own?'YOUR WISHES':"FAMILY WISHES"}</p><h1>{own?`Hello, ${me.name.trim().split(/\s+/)[0]}`:`${person?.name||'Family'}’s list`}</h1></div>{own&&<button className="primary" onClick={()=>open({kind:'wish'})}><Plus size={17}/>Add item</button>}</div>
    <div className="list-caption"><span>{loading?'Loading…':`${wishes.length} ${wishes.length===1?'item':'items'}`}</span>{!own&&<span>Purchases are hidden from the recipient.</span>}</div>
    {!modal&&error&&<p className="error banner" role="alert">{error}</p>}
    <span id="reorder-help" className="sr-only">Drag to reorder, or use the up and down arrow keys. Escape cancels dragging.</span><span className="sr-only" role="status">{reorder.announcement}</span>
    <section className="wish-list" {...reorder.listProps} aria-label={own?'My wishes':`${person?.name} wishes`} aria-busy={loading}>
     {loading?<div className="empty"><p>Loading list…</p></div>:!wishes.length?<div className="empty"><Gift size={30} strokeWidth={1.3}/><h2>{own?'What’s on your list?':'No wishes yet.'}</h2>{own&&<button className="text-button" onClick={()=>open({kind:'wish'})}>Add your first item <span aria-hidden="true">→</span></button>}</div>:wishes.map((wish,index)=><article className={reorder.draggingId===wish.id?'wish dragging':'wish'} data-wish-id={wish.id} key={wish.id}>{own?<button type="button" className="drag-handle" aria-label={'Reorder '+wish.title} aria-describedby="reorder-help" title="Drag to reorder" disabled={busy||wishes.length<2} {...reorder.handleProps(wish.id)}><Menu size={19} strokeWidth={1.6}/></button>:<span className="item-number">{String(index+1).padStart(2,'0')}</span>}<div className={wish.photo?"wish-body has-photo":"wish-body"}>{wish.photo&&<img className="wish-photo" src={wish.photo} alt={wish.title} loading="lazy"/>}<div className="wish-details"><div className="wish-title"><h2>{wish.title}</h2>{wish.price&&<span className="price">{wish.price}</span>}</div>{wish.notes&&<p className="notes">{wish.notes}</p>}{wish.url&&<a className="item-link" href={wish.url} target="_blank" rel="noopener noreferrer">View item <ExternalLink size={12}/></a>}</div></div><div className="wish-actions">{own?<button className="secondary" onClick={()=>open({kind:'wish',wish})}>Edit</button>:wish.bought?<><span className="bought"><Check size={15}/>Bought</span>{!!wish.canUndo&&<button className="text-button undo" disabled={busy} onClick={()=>purchase(wish)}>Undo</button>}</>:<button className="secondary" disabled={busy} onClick={()=>purchase(wish)}>Mark bought</button>}</div></article>)}
    </section>
   </>:<><div className="page-heading"><div><p className="eyebrow">ACCOUNTS</p><h1>Family</h1></div><button className="primary" onClick={()=>open({kind:'member'})}><Plus size={17}/>Add person</button></div><div className="list-caption"><span>{family.length} {family.length===1?'person':'people'}</span></div><section className="wish-list">{family.map(p=><div className="member-row" key={p.id}><span className="avatar">{p.name.slice(0,1).toUpperCase()}</span><div><h2>{p.name}{p.id===me.id&&<span className="you">You</span>}</h2><span className="muted">{p.username}</span></div><button className="secondary member-edit" onClick={()=>open({kind:'member',member:p})}>Edit</button></div>)}</section></>}
  </main></div>
  {notice&&<div className="toast" role="status"><Check size={16}/>{notice}</div>}
  <dialog ref={dialog} onCancel={e=>{e.preventDefault();close()}} onClick={e=>{if(e.target===e.currentTarget)close()}}>
   {modal&&<div className="dialog-body"><div className="dialog-heading"><h2>{modal.kind==='wish'?(modal.wish?'Edit item':'Add item'):modal.kind==='member'?(modal.member?'Edit person':'Add person'):'Remove item?'}</h2><button className="icon-button" aria-label="Close" onClick={close} disabled={busy}><X size={20}/></button></div>
    {modal.kind==='delete'?<><p>Remove “{modal.wish.title}” from your list?</p>{error&&<p className="error" role="alert">{error}</p>}<div className="form-actions"><button className="secondary" onClick={close} disabled={busy}>Cancel</button><button className="danger" onClick={remove} disabled={busy}>{busy?'Removing…':'Remove'}</button></div></>:<form onSubmit={save}>
     {modal.kind==='wish'?<><label>Item<input name="title" required maxLength={120} defaultValue={modal.wish?.title} autoFocus/></label><div className="form-split"><label>Link <span>(optional)</span><input type="url" name="url" placeholder="https://" maxLength={2000} defaultValue={modal.wish?.url}/></label><label>Price <span>(optional)</span><input name="price" maxLength={40} placeholder="$" defaultValue={modal.wish?.price}/></label></div><label>Photo <span>(optional)</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={choosePhoto}/></label>{photo&&<div className="photo-preview"><img src={photo} alt="Item photo preview"/><button type="button" className="text-button" disabled={busy} onClick={()=>setPhoto('')}>Remove photo</button></div>}<label>Notes <span>(optional)</span><textarea name="notes" rows={3} maxLength={1200} placeholder="Size, color, or anything else" defaultValue={modal.wish?.notes}/></label></>:<><label>Name<input name="name" required maxLength={60} defaultValue={modal.member?.name} autoFocus/></label><label>Username<input name="username" autoComplete="off" autoCapitalize="none" spellCheck={false} pattern="[a-zA-Z0-9._\-]{2,32}" required maxLength={32} defaultValue={modal.member?.username}/></label>{modal.member&&<label className="checkbox-label"><input type="checkbox" checked={replacePassword} onChange={e=>setReplacePassword(e.target.checked)}/>Set password</label>}{(!modal.member||replacePassword)&&<label>Password<input name="password" type="password" autoComplete="new-password"/></label>}</>}
     {error&&<p className="error" role="alert">{error}</p>}<div className="form-actions">{modal.kind==='wish'&&modal.wish&&<button type="button" className="text-button delete-button" onClick={()=>open({kind:'delete',wish:modal.wish!})} disabled={busy}>Remove item</button>}<button type="button" className="secondary" onClick={close} disabled={busy}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':modal.kind==='member'&&!modal.member?'Create account':'Save'}</button></div>
    </form>}
   </div>}
  </dialog>
 </div>;
}



