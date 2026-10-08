"use client";
import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import { ApiError } from "@/lib/api";
import { AuthProvider } from "./auth-provider";
import { WishlistProvider } from "./wishlist-provider";

export function AppProviders({children}: {children:ReactNode}) {
  const [client] = useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:60_000,gcTime:300_000,refetchOnWindowFocus:false,retry:(count,error)=>!(error instanceof ApiError&&error.status>=400&&error.status<500)&&count<1}}}));
  useEffect(()=>{const limited=(event:Event)=>{if(event instanceof CustomEvent && typeof event.detail?.message === "string")toast.error(event.detail.message,{id:"api-rate-limit"});};window.addEventListener("api-rate-limit",limited);return()=>window.removeEventListener("api-rate-limit",limited);},[]);
  return <QueryClientProvider client={client}><AuthProvider><WishlistProvider>{children}</WishlistProvider><Toaster position="bottom-left" richColors duration={4000} visibleToasts={3}/></AuthProvider></QueryClientProvider>;
}
