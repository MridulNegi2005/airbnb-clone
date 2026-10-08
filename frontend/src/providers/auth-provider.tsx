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
  const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[name,setName]=useState("");
  const [showPassword,setShowPassword]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState(false);
  const success=useRef<(()=>void)|undefined>(undefined),cancel=useRef<(()=>void)|undefined>(undefined);
  const owned=useQuery({queryKey:queryKeys.hostListings,queryFn:({signal})=>getHostListings(signal),enabled:status==="authenticated"});
  const openAuth=useCallback((onSuccess?:()=>void,onCancel?:()=>void,initialMode:"login"|"register"="login")=>{success.current=onSuccess;cancel.current=onCancel;setError("");setPassword("");setShowPassword(false);setMode(initialMode);setStep(0);setOpen(true);},[]);
  useEffect(()=>{
    let active=true;
    const controller=new AbortController();
    Promise.resolve().then(async()=>{
      const initialToken=getToken();
      if(!initialToken) {if(active)setStatus("anonymous");return;}
      try {const current=await getCurrentUser(controller.signal);if(active&&getToken()===initialToken){setUser(current);setStatus("authenticated");}}
      catch(reason) {if(active&&getToken()===initialToken){if(reason instanceof ApiError&&reason.status===401)clearToken();setStatus("anonymous");}}
    });
    const expired=()=>{setUser(null);setStatus("anonymous");client.removeQueries({predicate:q=>["wishlists","saved-listings","bookings","host-listings","host-listing","host-bookings","conversations","messages","unread-count"].includes(String(q.queryKey[0]))});openAuth();};
    window.addEventListener("auth-expired",expired);
    return ()=>{active=false;controller.abort();window.removeEventListener("auth-expired",expired);};
  },[client,openAuth]);
  const logout=()=>{clearToken();setUser(null);setStatus("anonymous");client.removeQueries({predicate:q=>["wishlists","saved-listings","bookings","host-listings","host-listing","host-bookings","conversations","messages","unread-count"].includes(String(q.queryKey[0]))});toast("Logged out");};
  const close=useCallback(()=>{if(pending)return;setOpen(false);cancel.current?.();cancel.current=undefined;success.current=undefined;},[pending]);
  async function authenticate(result:import("@/types/api").AuthResponse) {
    setToken(result.access_token);setUser(result.user);setStatus("authenticated");setOpen(false);setPassword("");
    await client.invalidateQueries({queryKey:queryKeys.hostListings});
    toast(`Welcome back, ${result.user.name.split(" ")[0]}`);
    const continuation=success.current;success.current=undefined;cancel.current=undefined;continuation?.();
  }
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(pending||cooldown.blocked)return;setError("");
    if(step===0){setStep(1);return;}
    setPending(true);
    try {
      const result=mode==="login"?await login({email,password}):await register({name,email,password});
      setToken(result.access_token);setUser(result.user);setStatus("authenticated");setOpen(false);setPassword("");
      await client.invalidateQueries({queryKey:queryKeys.hostListings});
      toast(`Welcome${mode==="login"?" back":""}, ${result.user.name.split(" ")[0]}`);
      const continuation=success.current;success.current=undefined;cancel.current=undefined;continuation?.();
    } catch(reason) {cooldown.record(reason);setError(reason instanceof Error?reason.message:"We could not sign you in. Please try again.");}
    finally {setPending(false);}
  }
  return <AuthContext.Provider value={{user,status,isHost:(owned.data?.length??0)>0,updateUser:setUser,openAuth,logout}}>{children}<Modal open={open} onClose={close} title="Log in or sign up"><form className="auth-form" onSubmit={submit}><h3>Welcome to Airbnb</h3><p className="muted">{mode==="login"?"Log in to plan your next stay.":"Create an account to start exploring."}</p><label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={event=>setEmail(event.target.value)} /></label>{step===1&&<>{mode==="register"&&<label>Full name<input value={name} required maxLength={80} autoComplete="name" onChange={event=>setName(event.target.value)}/></label>}<label>Password<div className="password-input"><input aria-label="Password" type={showPassword?"text":"password"} autoComplete={mode==="login"?"current-password":"new-password"} minLength={mode==="register"?8:1} maxLength={128} required value={password} onChange={event=>setPassword(event.target.value)}/><button type="button" onClick={()=>setShowPassword(value=>!value)}>{showPassword?"Hide":"Show"}</button></div></label></>}{error&&<p role="alert" className="error-text">{error}</p>}<GradientButton type="submit" disabled={pending||cooldown.blocked}>{pending?"Please wait…":step===0?"Continue":mode==="login"?"Log in":"Sign up"}</GradientButton><button className="text-button" type="button" onClick={()=>{setMode(value=>value==="login"?"register":"login");setError("");}}>{mode==="login"?"New here? Create an account":"Already have an account? Log in"}</button><p className="muted small">Signed up with Google? Use Continue with Google.</p><div className="auth-divider">or</div>{open&&<GoogleSignInButton onSuccess={result=>{void authenticate(result);}} onError={setError}/>}<p className="muted small">By continuing, you agree to our <Link href="/terms" onClick={close} style={{textDecoration:"underline"}}>Terms of Service</Link> and <Link href="/privacy" onClick={close} style={{textDecoration:"underline"}}>Privacy Policy</Link>.</p><div className="demo-shortcuts"><button type="button" className="outline-button" onClick={()=>{setEmail("rohan@example.com");setStep(1);setMode("login");}}>Demo guest</button><button type="button" className="outline-button" onClick={()=>{setEmail("kavya@example.com");setStep(1);setMode("login");}}>Demo host</button></div><p className="muted small">Use the demo account password configured by the backend.</p></form></Modal></AuthContext.Provider>;
}
export function useAuth():AuthContextValue {const value=useContext(AuthContext);if(!value)throw new Error("useAuth must be inside AuthProvider");return value;}
