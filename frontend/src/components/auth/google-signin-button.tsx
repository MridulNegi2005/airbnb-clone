"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { googleLogin } from "@/lib/api";
import type { AuthResponse } from "@/types/api";
import { useApiCooldown } from "@/hooks/use-api-cooldown";

type GoogleIdentity = { accounts: { id: {
  initialize: (options:{client_id:string;callback:(response:{credential:string})=>void;ux_mode:"popup";use_fedcm_for_prompt:boolean})=>void;
  renderButton:(element:HTMLElement,options:{type:"icon"|"standard";theme:"outline";size:"large";shape:"rectangular";text:"continue_with";width:number})=>void;
} } };
export function GoogleSignInButton({onSuccess,onError,disabled=false,onStart,onSettled,compact=false}:{onSuccess:(response:AuthResponse)=>void|Promise<void>;onError:(message:string)=>void;disabled?:boolean;onStart?:()=>boolean;onSettled?:()=>void;compact?:boolean}){
  const container=useRef<HTMLDivElement>(null),success=useRef(onSuccess),failure=useRef(onError);
  const [ready,setReady]=useState(false),[pending,setPending]=useState(false);
  const cooldown=useApiCooldown();
  const inFlight=useRef(false),blocked=useRef(false),record=useRef(cooldown.record);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const external=useRef({disabled,onStart,onSettled});
  useEffect(()=>{external.current={disabled,onStart,onSettled};},[disabled,onStart,onSettled]);
  useEffect(()=>{blocked.current=cooldown.blocked;record.current=cooldown.record;},[cooldown.blocked,cooldown.record]);
  const clientId=process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  useEffect(()=>{success.current=onSuccess;failure.current=onError;},[onSuccess,onError]);
  const initialize=useCallback(()=>{
    const identity=(window as unknown as Window & {google?:GoogleIdentity}).google?.accounts?.id;
    if(!clientId||!identity||!container.current)return;
    identity.initialize({client_id:clientId,ux_mode:"popup",use_fedcm_for_prompt:true,callback:response=>{
      if(!mounted.current||inFlight.current||blocked.current||external.current.disabled||external.current.onStart?.()===false)return;
      inFlight.current=true;
      setPending(true);
      void googleLogin({credential:response.credential}).then(result=>{if(mounted.current)return success.current(result);}).catch(reason=>{if(mounted.current){record.current(reason);failure.current(reason instanceof Error?reason.message:"Google sign-in failed");}}).finally(()=>{inFlight.current=false;if(mounted.current)setPending(false);external.current.onSettled?.();});
    }});
    identity.renderButton(container.current,{type:compact?"icon":"standard",theme:"outline",size:"large",shape:"rectangular",text:"continue_with",width:compact?60:Math.min(400,container.current.clientWidth||360)});
    setReady(true);
  },[clientId,compact]);
  useEffect(()=>{if(clientId)initialize();},[clientId,initialize]);
  if(!clientId)return <p className="small muted">Google sign-in is unavailable right now. Use email to continue.</p>;
  return <div className={compact?"google-signin-compact":undefined} aria-busy={pending}><Script id="google-identity-services" src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={initialize} onError={()=>onError("Google sign-in could not load. Use email or try again.")}/>{compact&&<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M22 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.6a4.8 4.8 0 0 1-2.1 3.1v2.8h3.4c2-1.8 3.1-4.5 3.1-7.9Z"/><path fill="#34a853" d="M12 22c2.8 0 5.1-.9 6.9-2.5l-3.4-2.8c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.2H2.7v2.8A10.4 10.4 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.2 13.5a6 6 0 0 1 0-3.8V6.9H2.7a10.1 10.1 0 0 0 0 9.4l3.5-2.8Z"/><path fill="#ea4335" d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.9-3A10 10 0 0 0 12 2a10.4 10.4 0 0 0-9.3 4.9l3.5 2.8C7 7.4 9.3 5.8 12 5.8Z"/></svg>}<div ref={container} inert={pending||disabled||cooldown.blocked} style={{minHeight:compact?60:44}}/>{!ready&&<p className={compact?"sr-only":"small muted"}>Loading Google sign-in…</p>}{pending&&<p role="status" className={compact?"sr-only":undefined}>Signing you in…</p>}</div>;
}
