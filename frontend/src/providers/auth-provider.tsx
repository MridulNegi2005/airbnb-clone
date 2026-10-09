"use client";
import Link from "next/link";
import { UserRound } from "lucide-react";
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

const privateQueryRoots=new Set(["wishlists","saved-listings","bookings","host-listings","host-listing","host-bookings","blocked-dates","conversations","messages","unread-count"]);

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
  useEffect(()=>{if(open||!authPresent)return;const duration=window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:150;const timer=window.setTimeout(()=>setAuthPresent(false),duration);return()=>window.clearTimeout(timer);},[open,authPresent]);
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
    const expired=()=>{sessionVersion.current++;stop();clearToken();setUser(null);setStatus("anonymous");client.removeQueries({predicate:q=>privateQueryRoots.has(String(q.queryKey[0]))});openAuth();};
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
  const logout=()=>{sessionVersion.current++;stopRestore.current?.();clearToken();setUser(null);setStatus("anonymous");client.removeQueries({predicate:q=>privateQueryRoots.has(String(q.queryKey[0]))});toast("Logged out");};
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
  return <AuthContext.Provider value={{user,status,isHost:(owned.data?.length??0)>0,updateUser,openAuth,logout}}>{children}
    <Modal open={open} onClose={close} title="Log in or sign up" width={480} presentation="auth">
      <form className="auth-form" onSubmit={submit}>
        <div className="auth-intro"><svg className="auth-logo" viewBox="0 0 32 40" fill="none" aria-hidden="true"><path d="M16 2c-2 0-3.4 2.4-4.5 4.8L2.7 26.4C.1 32.5 2.2 37 6.8 37c3.4 0 6.7-3.7 9.2-7.4 2.5 3.7 5.8 7.4 9.2 7.4 4.6 0 6.7-4.5 4.1-10.6L20.5 6.8C19.4 4.4 18 2 16 2Z" stroke="currentColor" strokeWidth="2"/><path d="M16 29.6c-2.9-4.3-5.2-8.4-5.2-11.1a5.2 5.2 0 0 1 10.4 0c0 2.7-2.3 6.8-5.2 11.1Z" stroke="currentColor" strokeWidth="2"/></svg><h3>{step===0?"Log in or sign up":mode==="login"?"Welcome back":"Finish signing up"}</h3></div>
        <div className="auth-fields">
          <label className="auth-field"><input disabled={pending} type="email" autoComplete="email" placeholder=" " required maxLength={254} value={email} aria-invalid={Boolean(error)} aria-describedby={error?"auth-error":undefined} onChange={event=>setEmail(event.target.value)} /><span>Email</span></label>
          {step===1&&<>{mode==="register"&&<label className="auth-field"><input disabled={pending} value={name} required maxLength={80} autoComplete="name" placeholder=" " onChange={event=>setName(event.target.value)}/><span>Full name</span></label>}
          <label className="auth-field password-input"><input disabled={pending} ref={passwordField} aria-label="Password" aria-invalid={Boolean(error)} aria-describedby={error?"auth-error":undefined} type={showPassword?"text":"password"} autoComplete={mode==="login"?"current-password":"new-password"} placeholder=" " minLength={mode==="register"?8:1} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)}/><span>Password</span><button type="button" disabled={pending} onClick={()=>setShowPassword(value=>!value)}>{showPassword?"Hide":"Show"}</button></label></>}
        </div>
        {error&&<p id="auth-error" role="alert" className="error-text">{error}</p>}
        <GradientButton type="submit" disabled={pending||cooldown.blocked}>{pending?"Please wait…":step===0?"Continue":mode==="login"?"Log in":"Sign up"}</GradientButton>
        <div className="auth-divider">or</div>
        <div className="auth-alternatives">
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?authPresent&&<GoogleSignInButton compact disabled={pending} onStart={()=>{if(authLock.current||cooldown.blocked)return false;authLock.current=true;setPending(true);return true;}} onSettled={()=>{authLock.current=false;setPending(false);}} onSuccess={authenticate} onError={setError}/>:<button className="auth-social" type="button" disabled aria-label="Continue with Google" title="Google sign-in is unavailable right now. Use email to continue."><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M22 12.2c0-.7-.1-1.4-.2-2.2H12v4.2h5.6a4.8 4.8 0 0 1-2.1 3.1v2.8h3.4c2-1.8 3.1-4.5 3.1-7.9Z"/><path fill="#34a853" d="M12 22c2.8 0 5.1-.9 6.9-2.5l-3.4-2.8c-.9.6-2.1 1-3.5 1-2.7 0-5-1.8-5.8-4.2H2.7v2.8A10.4 10.4 0 0 0 12 22Z"/><path fill="#fbbc05" d="M6.2 13.5a6 6 0 0 1 0-3.8V6.9H2.7a10.1 10.1 0 0 0 0 9.4l3.5-2.8Z"/><path fill="#ea4335" d="M12 5.8c1.5 0 2.8.5 3.8 1.5l2.9-3A10 10 0 0 0 12 2a10.4 10.4 0 0 0-9.3 4.9l3.5 2.8C7 7.4 9.3 5.8 12 5.8Z"/></svg></button>}
          <button className="auth-social" type="button" aria-label="Demo guest" title="Demo guest" disabled={pending} onClick={()=>{setEmail("rohan@example.com");setStep(1);setMode("login");}}><UserRound size={20}/></button>
        </div>
        <details className="auth-options"><summary>More sign-in options</summary><div>
          <button className="text-button" type="button" disabled={pending} onClick={()=>{setMode(value=>value==="login"?"register":"login");setError("");}}>{mode==="login"?"New here? Create an account":"Already have an account? Log in"}</button>
          <button type="button" className="outline-button" disabled={pending} onClick={()=>{setEmail("kavya@example.com");setStep(1);setMode("login");}}>Demo host</button>
          <p className="muted small">{process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?"Signed up with Google? Use Continue with Google.":"Google sign-in is unavailable right now. Use email to continue."}</p>
          <p className="muted small">By continuing, you agree to our <Link href="/terms" onClick={close} style={{textDecoration:"underline"}}>Terms of Service</Link> and <Link href="/privacy" onClick={close} style={{textDecoration:"underline"}}>Privacy Policy</Link>.</p>
        </div></details>
      </form>
    </Modal>
  </AuthContext.Provider>;
}
export function useAuth():AuthContextValue {const value=useContext(AuthContext);if(!value)throw new Error("useAuth must be inside AuthProvider");return value;}
