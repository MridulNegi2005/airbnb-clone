"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, getCurrentUser, getHostListings, login, queryKeys, register } from "@/lib/api";
import { clearToken, getToken, setToken } from "@/lib/auth-storage";
import type { UserPrivate } from "@/types/api";
import { Modal } from "@/components/ui/modal";
import { GradientButton } from "@/components/ui/gradient-button";
import { GoogleSignInButton } from "@/components/auth/google-signin-button";
import { useApiCooldown } from "@/hooks/use-api-cooldown";

type AuthStatus = "loading"|"authenticated"|"anonymous";
type AuthContextValue = {user:UserPrivate|null;status:AuthStatus;isHost:boolean;updateUser:(user:UserPrivate)=>void;openAuth:(onSuccess?:()=>void,onCancel?:()=>void,initialMode?:"login"|"register")=>void;logout:()=>void};
const AuthContext=createContext<AuthContextValue|null>(null);

export function AuthProvider({children}: {children:ReactNode}) {
  const client=useQueryClient();
  const cooldown=useApiCooldown();
  const [user,setUser]=useState<UserPrivate|null>(null),[status,setStatus]=useState<AuthStatus>("loading");
  const [open,setOpen]=useState(false),[mode,setMode]=useState<"login"|"register">("login"),[step,setStep]=useState(0);
  const [authPresent,setAuthPresent]=useState(false);
  if(open&&!authPresent)setAuthPresent(true);
  useEffect(()=>{if(open||!authPresent)return;const duration=window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:200;const timer=window.setTimeout(()=>setAuthPresent(false),duration);return()=>window.clearTimeout(timer);},[open,authPresent]);
  const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState("");
  const [showPassword,setShowPassword]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState(false);
  const passwordField=useRef<HTMLInputElement>(null);
  const authLock=useRef(false);
  const sessionVersion=useRef(0),stopRestore=useRef<(()=>void)|undefined>(undefined);
  useEffect(()=>{if(!open||step!==1)return;const frame=requestAnimationFrame(()=>passwordField.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[open,step]);
  const success=useRef<(()=>void)|undefined>(undefined),cancel=useRef<(()=>void)|undefined>(undefined);
  const owned=useQuery({queryKey:queryKeys.hostListings,queryFn:({signal})=>getHostListings(signal),enabled:status==="authenticated"});
  const openAuth=useCallback((onSuccess?:()=>void,onCancel?:()=>void,initialMode:"login"|"register"="login")=>{success.current=onSuccess;cancel.current=onCancel;setError("");setPassword("");setShowPassword(false);setMode(initialMode);setStep(0);setOpen(true);},[]);
  const updateUser=useCallback((updated:UserPrivate)=>{
    if(!getToken())return;
    setUser(current=>getToken()&&current?.id===updated.id?updated:current);
  },[]);
  useEffect(()=>{
    let active=true,inFlight=false,rateLimited=false,attempt=0,retryAt=0,timer:number|undefined,controller:AbortController|undefined,notice:ReturnType<typeof toast>|undefined;
    const version=sessionVersion.current,initialToken=getToken();
    const current=()=>active&&sessionVersion.current===version&&getToken()===initialToken;
    const stop=()=>{active=false;controller?.abort();if(timer!==undefined)window.clearTimeout(timer);if(notice!==undefined){toast.dismiss(notice);notice=undefined;}};
    stopRestore.current=stop;
    const expired=()=>{sessionVersion.current++;stop();clearToken();setUser(null);setStatus("anonymous");client.removeQueries({predicate:q=>["wishlists","saved-listings","bookings","host-listings","host-listing","host-bookings","conversations","messages","unread-count"].includes(String(q.queryKey[0]))});openAuth();};
    async function restore(){
      if(!current()||inFlight||rateLimited||Date.now()<retryAt)return;
      if(!initialToken){setStatus("anonymous");return;}
      inFlight=true;controller=new AbortController();
      try {const restored=await getCurrentUser(controller.signal);if(current()){setUser(restored);setStatus("authenticated");stop();}}
      catch(reason){
        if(!current())return;
        if(reason instanceof ApiError&&reason.status===401){expired();return;}
        const delay=Math.max(Math.min(1000*2**Math.min(attempt++,5),30_000),reason instanceof ApiError?reason.retryAfterSeconds*1000:0);
        retryAt=Date.now()+delay;
        if(reason instanceof ApiError&&reason.status===429){
          rateLimited=true;
          notice=toast("Account check paused",{id:notice,description:`You can retry in ${Math.ceil(delay/1000)} seconds. Your saved session is still available.`,duration:Infinity,action:undefined});
          timer=window.setTimeout(()=>{
            timer=undefined;if(!current())return;
            notice=toast("Ready to reconnect to your account",{id:notice,description:"Retry to finish loading your saved session.",duration:Infinity,action:{label:"Retry",onClick:event=>{
              event.preventDefault();if(!current()||Date.now()<retryAt)return;
              rateLimited=false;notice=toast("Reconnecting to your account",{id:notice,description:"Checking your saved session…",duration:Infinity,action:undefined});void restore();
            }}});
          },delay);
          return;
        }
        if(notice===undefined)notice=toast("Reconnecting to your account",{description:"We’re having trouble connecting. We’ll retry automatically. You can keep browsing.",duration:Infinity});
        timer=window.setTimeout(()=>{timer=undefined;void restore();},delay);
      }finally{inFlight=false;}
    }
    const recover=()=>{if(rateLimited)return;if(timer!==undefined&&Date.now()>=retryAt){window.clearTimeout(timer);timer=undefined;}void restore();};
    Promise.resolve().then(restore);
    window.addEventListener("auth-expired",expired);
    window.addEventListener("online",recover);window.addEventListener("focus",recover);
    return ()=>{stop();if(stopRestore.current===stop)stopRestore.current=undefined;window.removeEventListener("auth-expired",expired);window.removeEventListener("online",recover);window.removeEventListener("focus",recover);};
  },[client,openAuth]);
  const logout=()=>{sessionVersion.current++;stopRestore.current?.();clearToken();setUser(null);setStatus("anonymous");client.removeQueries({predicate:q=>["wishlists","saved-listings","bookings","host-listings","host-listing","host-bookings","conversations","messages","unread-count"].includes(String(q.queryKey[0]))});toast("Logged out");};
  const close=useCallback(()=>{if(pending||authLock.current)return;setOpen(false);cancel.current?.();cancel.current=undefined;success.current=undefined;},[pending]);
  async function authenticate(result:import("@/types/api").AuthResponse) {
    sessionVersion.current++;stopRestore.current?.();
    setToken(result.access_token);setUser(result.user);setStatus("authenticated");setOpen(false);setPassword("");
    await client.invalidateQueries({queryKey:queryKeys.hostListings});
    toast(`Welcome back, ${result.user.name.split(" ")[0]}`);
    const continuation=success.current;success.current=undefined;cancel.current=undefined;continuation?.();
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(pending||authLock.current||cooldown.blocked)return;setError("");
    if(step===0){setStep(1);return;}
    authLock.current=true;setPending(true);
    try {
      const result=mode==="login"?await login({email,password}):await register({name,email,password});
      sessionVersion.current++;stopRestore.current?.();
      setToken(result.access_token);setUser(result.user);setStatus("authenticated");setOpen(false);setPassword("");
      await client.invalidateQueries({queryKey:queryKeys.hostListings});
      toast(`Welcome${mode==="login"?" back":""}, ${result.user.name.split(" ")[0]}`);
      const continuation=success.current;success.current=undefined;cancel.current=undefined;continuation?.();
    } catch(reason) {cooldown.record(reason);setError(reason instanceof Error?reason.message:"We could not sign you in. Please try again.");}
    finally {authLock.current=false;setPending(false);}
  }
  return <AuthContext.Provider value={{user,status,isHost:(owned.data?.length??0)>0,updateUser,openAuth,logout}}>{children}<Modal open={open} onClose={close} title="Log in or sign up"><form className="auth-form" onSubmit={submit}><h3>Welcome to Airbnb</h3><p className="muted">{mode==="login"?"Log in to plan your next stay.":"Create an account to start exploring."}</p><label>Email<input disabled={pending} type="email" autoComplete="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} /></label>{step===1&&<>{mode==="register"&&<label>Full name<input disabled={pending} value={name} required maxLength={80} autoComplete="name" onChange={event=>setName(event.target.value)}/></label>}<label>Password<div className="password-input"><input disabled={pending} ref={passwordField} aria-label="Password" type={showPassword?"text":"password"} autoComplete={mode==="login"?"current-password":"new-password"} minLength={mode==="register"?8:1} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)}/><button type="button" disabled={pending} onClick={()=>setShowPassword(value=>!value)}>{showPassword?"Hide":"Show"}</button></div></label></>}{error&&<p role="alert" className="error-text">{error}</p>}<GradientButton type="submit" disabled={pending||cooldown.blocked}>{pending?"Please wait…":step===0?"Continue":mode==="login"?"Log in":"Sign up"}</GradientButton><button className="text-button" type="button" disabled={pending} onClick={()=>{setMode(value=>value==="login"?"register":"login");setError("");}}>{mode==="login"?"New here? Create an account":"Already have an account? Log in"}</button><p className="muted small">Signed up with Google? Use Continue with Google.</p><div className="auth-divider">or</div>{authPresent&&<GoogleSignInButton disabled={pending} onStart={()=>{if(authLock.current||cooldown.blocked)return false;authLock.current=true;setPending(true);return true;}} onSettled={()=>{authLock.current=false;setPending(false);}} onSuccess={authenticate} onError={setError}/>}<p className="muted small">By continuing, you agree to our <Link href="/terms" onClick={close} style={{textDecoration:"underline"}}>Terms of Service</Link> and <Link href="/privacy" onClick={close} style={{textDecoration:"underline"}}>Privacy Policy</Link>.</p><div className="demo-shortcuts"><button type="button" className="outline-button" disabled={pending} onClick={()=>{setEmail("rohan@example.com");setStep(1);setMode("login");}}>Demo guest</button><button type="button" className="outline-button" disabled={pending} onClick={()=>{setEmail("kavya@example.com");setStep(1);setMode("login");}}>Demo host</button></div><p className="muted small">Use the demo account password configured by the backend.</p></form></Modal></AuthContext.Provider>;
}
export function useAuth():AuthContextValue {const value=useContext(AuthContext);if(!value)throw new Error("useAuth must be inside AuthProvider");return value;}
