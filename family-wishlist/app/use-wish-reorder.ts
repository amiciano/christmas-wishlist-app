'use client';
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';

export function useWishReorder<T extends {id:string;title:string}>({items,setItems,save,enabled}:{items:T[];setItems:(items:T[])=>void;save:(items:T[])=>Promise<void>;enabled:boolean}){
 const [draggingId,setDraggingId]=useState<string|null>(null);
 const [announcement,setAnnouncement]=useState('');
 const locked=useRef(false);
 const drag=useRef<{id:string;original:T[];order:T[];y:number;x:number;moved:boolean}|null>(null);
 const frame=useRef(0);
 function stop(){cancelAnimationFrame(frame.current);drag.current=null;setDraggingId(null);}
 function cancel(){const current=drag.current;if(!current)return;setItems(current.original);stop();locked.current=false;setAnnouncement('Reorder cancelled.');}
 useEffect(()=>{const escape=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'&&drag.current){e.preventDefault();cancel();}};window.addEventListener('keydown',escape);return()=>{window.removeEventListener('keydown',escape);cancelAnimationFrame(frame.current);};},[]);
 useEffect(()=>{if(!enabled&&drag.current)cancel();},[enabled]);
 function moveAtPointer(){
  const current=drag.current;if(!current)return;
  const rows=Array.from(document.querySelectorAll<HTMLElement>('[data-wish-id]'));
  const target=rows.find(row=>{const r=row.getBoundingClientRect();return current.y>=r.top&&current.y<=r.bottom;});
  const from=current.order.findIndex(w=>w.id===current.id),to=current.order.findIndex(w=>w.id===target?.dataset.wishId);
  if(!target||to<0||from===to)return;
  const rect=target.getBoundingClientRect(),middle=rect.top+rect.height/2;
  if((to>from&&current.y<middle)||(to<from&&current.y>middle))return;
  const next=[...current.order];next.splice(to,0,next.splice(from,1)[0]);current.order=next;current.moved=true;setItems(next);
  setAnnouncement(`${next[to].title}, position ${to+1} of ${next.length}.`);
 }
 function scroll(){
  const current=drag.current;if(!current)return;
  if(current.y<70)window.scrollBy(0,-10);else if(current.y>window.innerHeight-70)window.scrollBy(0,10);
  moveAtPointer();frame.current=requestAnimationFrame(scroll);
 }
 function pointerDown(e:PointerEvent<HTMLButtonElement>,id:string){
  if(!enabled||locked.current||!e.isPrimary||e.button!==0)return;
  e.preventDefault();e.currentTarget.focus();e.currentTarget.closest('section')!.setPointerCapture(e.pointerId);
  locked.current=true;drag.current={id,original:items,order:items,x:e.clientX,y:e.clientY,moved:false};setDraggingId(id);frame.current=requestAnimationFrame(scroll);
 }
 function pointerMove(e:PointerEvent<HTMLElement>){if(drag.current){drag.current.x=e.clientX;drag.current.y=e.clientY;}}
 async function pointerUp(){
  const current=drag.current;if(!current)return;stop();
  try{if(current.moved)await save(current.order);}finally{locked.current=false;}
 }
 async function keyDown(e:KeyboardEvent<HTMLButtonElement>,id:string){
  if(!enabled||locked.current||!['ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
  e.preventDefault();const from=items.findIndex(w=>w.id===id);
  const to=e.key==='Home'?0:e.key==='End'?items.length-1:Math.max(0,Math.min(items.length-1,from+(e.key==='ArrowUp'?-1:1)));
  if(from===to)return;const next=[...items];next.splice(to,0,next.splice(from,1)[0]);locked.current=true;setItems(next);
  setAnnouncement(`${next[to].title}, position ${to+1} of ${next.length}.`);
  try{await save(next);}finally{
   locked.current=false;
   requestAnimationFrame(()=>Array.from(document.querySelectorAll<HTMLElement>('[data-wish-id]')).find(row=>row.dataset.wishId===id)?.querySelector<HTMLButtonElement>('.drag-handle')?.focus());
  }
 }
 return {draggingId,announcement,locked,listProps:{onPointerMove:pointerMove,onPointerUp:pointerUp,onPointerCancel:cancel,onLostPointerCapture:()=>{if(drag.current)cancel();}},handleProps:(id:string)=>({onPointerDown:(e:PointerEvent<HTMLButtonElement>)=>pointerDown(e,id),onKeyDown:(e:KeyboardEvent<HTMLButtonElement>)=>keyDown(e,id)})};
}
