"use client";
import { Minus, Plus } from "lucide-react";
export function Stepper({value,onChange,min=0,max=16,label,step=1}: {value:number;onChange:(value:number)=>void;min?:number;max?:number;label?:string;step?:number}) {
  return <div className="stepper"><button type="button" aria-label={`Decrease ${label ?? "count"}`} disabled={value<=min} onClick={()=>onChange(Math.max(min,value-step))}><Minus size={16}/></button><span aria-live="polite">{value}</span><button type="button" aria-label={`Increase ${label ?? "count"}`} disabled={value>=max} onClick={()=>onChange(Math.min(max,value+step))}><Plus size={16}/></button></div>;
}
