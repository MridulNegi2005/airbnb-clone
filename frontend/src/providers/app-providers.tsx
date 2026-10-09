"use client";
import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "./auth-provider";
import { WishlistProvider } from "./wishlist-provider";

export function AppProviders({children}: {children:ReactNode}) {
  const [client] = useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:60_000,gcTime:300_000,refetchOnWindowFocus:false,refetchOnReconnect:query=>!(query.state.error instanceof ApiError&&query.state.error.status===429),retry:(count,error)=>!(error instanceof ApiError&&error.status>=400&&error.status<500)&&count<1}}}));
  useEffect(()=>{const limited=(event:Event)=>{if(event instanceof CustomEvent && typeof event.detail?.message === "string")toast.error(event.detail.message,{id:"api-rate-limit"});};window.addEventListener("api-rate-limit",limited);return()=>window.removeEventListener("api-rate-limit",limited);},[]);
  return <QueryClientProvider client={client}><AuthProvider><WishlistProvider>{children}</WishlistProvider><Toaster position="bottom-left" offset={24} mobileOffset={{bottom:88,left:24,right:24}} duration={4000} visibleToasts={3} toastOptions={{className:"app-toast",style:{background:"#222",color:"#fff",border:0,borderRadius:9999,padding:"14px 20px",fontSize:14,boxShadow:"0 6px 16px rgb(0 0 0 / .12)"}}}/></AuthProvider></QueryClientProvider>;
}
