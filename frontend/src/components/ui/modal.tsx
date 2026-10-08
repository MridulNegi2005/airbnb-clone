"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const stack: symbol[] = [];
const subscribe = () => () => {};
let originalOverflow="";
let originalPadding="";
export function Modal({open,onClose,title,children,footer,width=568,presentation="default"}: {open:boolean;onClose:()=>void;title:string;children:ReactNode;footer?:ReactNode;width?:number;presentation?:"default"|"reviews"|"calendar"|"filters"|"checkout"|"profile"|"message-details"}) {
  const mounted = useSyncExternalStore(subscribe,()=>true,()=>false);
  const [present,setPresent] = useState(open);
  if(open&&!present) setPresent(true);
  useEffect(()=>{
    if(open||!present) return;
    const duration=window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:200;
    const timer=window.setTimeout(()=>setPresent(false),duration);
    return ()=>window.clearTimeout(timer);
  },[open,present]);
  const panel = useRef<HTMLDivElement>(null);
  const closeHandler = useRef(onClose);
  const id = useId();
  useEffect(()=>{closeHandler.current=onClose;},[onClose]);
  useEffect(()=>{
    if(!present||!mounted) return;
    const layer = Symbol(); stack.push(layer);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if(stack.length===1) { originalOverflow=document.documentElement.style.overflow; originalPadding=document.documentElement.style.paddingRight; const gap = window.innerWidth-document.documentElement.clientWidth; document.documentElement.style.overflow="hidden"; document.documentElement.style.paddingRight=`${gap}px`; }
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(el=>el.getClientRects().length);
    const frame = requestAnimationFrame(()=>focusable()[0]?.focus({preventScroll:true}));
    function key(event:KeyboardEvent) {
      if(stack[stack.length-1]!==layer) return;
      if(event.key==="Escape") { event.preventDefault(); event.stopPropagation(); closeHandler.current(); }
      if(event.key==="Tab") { const elements=focusable(), first=elements[0], last=elements[elements.length-1]; if(!first) { event.preventDefault(); panel.current?.focus(); } else if(event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();} else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();} }
    }
    document.addEventListener("keydown",key);
    return ()=>{ cancelAnimationFrame(frame); document.removeEventListener("keydown",key); const wasTop=stack[stack.length-1]===layer; const index=stack.indexOf(layer); if(index>=0) stack.splice(index,1); if(!stack.length) {document.documentElement.style.overflow=originalOverflow;document.documentElement.style.paddingRight=originalPadding;} if(wasTop&&opener?.isConnected)opener.focus({preventScroll:true}); };
  },[present,mounted]);
  if(!present || !mounted) return null;
  return createPortal(<div className="modal-backdrop" data-state={open?"open":"closing"} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div ref={panel} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} className="modal-panel" data-presentation={presentation} style={{maxWidth:width}}><header className="modal-header"><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={18}/></button><h2 id={id} className={presentation==="reviews"||presentation==="calendar"||presentation==="profile"?"sr-only":undefined}>{title}</h2></header><div className="modal-body">{children}</div>{footer&&<div className="modal-footer">{footer}</div>}</div></div>,document.body);
}
