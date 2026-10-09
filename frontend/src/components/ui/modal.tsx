"use client";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const stack: symbol[] = [];
const subscribe = () => () => {};
let originalOverflow="";
let originalPadding="";
let originalScrollbarWidth="";
export function Modal({open,onClose,title,children,footer,width=568,presentation="default",exitDuration=150,className="",backdropClassName=""}: {open:boolean;onClose:()=>void;title:string;children:ReactNode;footer?:ReactNode;width?:number;exitDuration?:number;className?:string;backdropClassName?:string;presentation?:"default"|"auth"|"reviews"|"calendar"|"filters"|"checkout"|"profile"|"message-details"|"wishlist"}) {
  const mounted = useSyncExternalStore(subscribe,()=>true,()=>false);
  const [present,setPresent] = useState(open);
  if(open&&!present) setPresent(true);
  useEffect(()=>{
    if(open||!present) return;
    const duration=window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:exitDuration;
    const timer=window.setTimeout(()=>setPresent(false),duration);
    return ()=>window.clearTimeout(timer);
  },[open,present,exitDuration]);
  const panel = useRef<HTMLDivElement>(null);
  const closeHandler = useRef(onClose);
  const id = useId();
  useEffect(()=>{closeHandler.current=onClose;},[onClose]);
  useEffect(()=>{
    if(!present||!mounted) return;
    const layer = Symbol(); stack.push(layer);
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if(stack.length===1) { const root=document.documentElement; originalOverflow=root.style.overflow; originalPadding=root.style.paddingRight; originalScrollbarWidth=root.style.getPropertyValue("--modal-scrollbar-width"); const gap=window.innerWidth-root.clientWidth; const padding=parseFloat(getComputedStyle(root).paddingRight)||0; root.style.overflow="hidden"; const lostWidth=root.clientWidth-(window.innerWidth-gap); root.style.paddingRight=`${padding+Math.max(0,lostWidth)}px`; root.style.setProperty("--modal-scrollbar-width",`${gap}px`); }
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, iframe, [tabindex="0"]') ?? []).filter(el=>el.getClientRects().length&&el.checkVisibility());
    const frame = requestAnimationFrame(()=>focusable()[0]?.focus({preventScroll:true}));
    function key(event:KeyboardEvent) {
      if(stack[stack.length-1]!==layer) return;
      if(panel.current?.inert){if(event.key==="Tab"||event.key==="Escape"){event.preventDefault();event.stopPropagation();}return;}
      if(event.key==="Escape") { event.preventDefault(); event.stopPropagation(); closeHandler.current(); }
      if(event.key==="Tab") { const elements=focusable(), first=elements[0], last=elements[elements.length-1]; if(!first) { event.preventDefault(); panel.current?.focus(); } else if(event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();} else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();} }
    }
    document.addEventListener("keydown",key);
    return ()=>{ cancelAnimationFrame(frame); document.removeEventListener("keydown",key); const wasTop=stack[stack.length-1]===layer; const index=stack.indexOf(layer); if(index>=0) stack.splice(index,1); if(!stack.length) {document.documentElement.style.overflow=originalOverflow;document.documentElement.style.paddingRight=originalPadding;if(originalScrollbarWidth)document.documentElement.style.setProperty("--modal-scrollbar-width",originalScrollbarWidth);else document.documentElement.style.removeProperty("--modal-scrollbar-width");} if(wasTop&&opener?.isConnected)opener.focus({preventScroll:true}); };
  },[present,mounted]);
  if(!present || !mounted) return null;
  return createPortal(<div className={`modal-backdrop ${backdropClassName}`} data-state={open?"open":"closing"} onMouseDown={event=>{if(open&&event.target===event.currentTarget)onClose();}}><div ref={panel} role="dialog" aria-modal={open} aria-hidden={!open} inert={!open} aria-labelledby={id} tabIndex={-1} className={`modal-panel ${className}`} data-presentation={presentation} style={{maxWidth:width}}><header className="modal-header"><button type="button" className="icon-button modal-close" aria-label="Close" onClick={onClose}><X size={16} strokeWidth={2}/></button><h2 id={id} className={presentation==="auth"||presentation==="reviews"||presentation==="calendar"||presentation==="profile"?"sr-only":undefined}>{title}</h2></header><div className="modal-body">{children}</div>{footer&&<div className="modal-footer">{footer}</div>}</div></div>,document.body);
}
