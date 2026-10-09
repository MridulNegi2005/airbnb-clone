"use client";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { googleLogin } from "@/lib/api";
import type { AuthResponse } from "@/types/api";
import { useApiCooldown } from "@/hooks/use-api-cooldown";

type GoogleIdentity = { accounts: { id: {
  initialize: (options:{client_id:string;callback:(response:{credential:string})=>void;ux_mode:"popup";use_fedcm_for_prompt:boolean})=>void;
  renderButton:(element:HTMLElement,options:{theme:"outline";size:"large";shape:"rectangular";text:"continue_with";width:number})=>void;
} } };
export function GoogleSignInButton({onSuccess,onError,disabled=false,onStart,onSettled}:{onSuccess:(response:AuthResponse)=>void|Promise<void>;onError:(message:string)=>void;disabled?:boolean;onStart?:()=>boolean;onSettled?:()=>void}){
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
    identity.renderButton(container.current,{theme:"outline",size:"large",shape:"rectangular",text:"continue_with",width:Math.min(400,container.current.clientWidth||360)});
    setReady(true);
  },[clientId]);
  useEffect(()=>{if(clientId)initialize();},[clientId,initialize]);
  if(!clientId)return <p className="small muted">Google sign-in is unavailable right now. Use email to continue.</p>;
  return <div aria-busy={pending}><Script id="google-identity-services" src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={initialize} onError={()=>onError("Google sign-in could not load. Use email or try again.")}/><div ref={container} inert={pending||disabled||cooldown.blocked} style={{minHeight:44}}/>{!ready&&<p className="small muted">Loading Google sign-in…</p>}{pending&&<p role="status">Signing you in…</p>}</div>;
}
