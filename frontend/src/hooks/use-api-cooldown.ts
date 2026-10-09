"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
export function useApiCooldown(){
  const [until,setUntil]=useState(0),[now,setNow]=useState(0);
  useEffect(()=>{if(!until)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[until]);
  const record=useCallback((error:unknown)=>{if(error instanceof ApiError&&error.status===429){const time=Date.now();setNow(time);setUntil(previous=>Math.max(previous,time+error.retryAfterSeconds*1000));}},[]);
  return {blocked:until>now,record};
}
