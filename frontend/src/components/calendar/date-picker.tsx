"use client";
import { DayPicker, type DateRange } from "react-day-picker";
import { useMemo } from "react";
import { blockedNights, countNights, toDateString, validateStay } from "@/lib/dates";
import type { BookedRange } from "@/types/api";
import styles from "./calendar.module.css";

export function DatePicker({value,onChange,bookedRanges=[],numberOfMonths=2,minNights=1,maxNights=365,hideNavigation=false,hideWeekdays=false}: {value:DateRange|undefined;onChange:(value:DateRange|undefined)=>void;bookedRanges?:BookedRange[];numberOfMonths?:number;minNights?:number;maxNights?:number;hideNavigation?:boolean;hideWeekdays?:boolean}) {
  const blocked = useMemo(()=>blockedNights(bookedRanges),[bookedRanges]);
  const today=new Date(); today.setHours(0,0,0,0);
  const end=new Date(today); end.setMonth(end.getMonth()+12);
  const from=value?.from&&!value.to?toDateString(value.from):null;
  const firstBlocked=from?Array.from(blocked).filter(day=>day>from).sort()[0]:undefined;
  function disabled(date:Date) {
    const key=toDateString(date);
    if(date<today || date>end) return true;
    if(from && key>from) {
      const nights=countNights(from,key);
      return nights<minNights || nights>maxNights || (firstBlocked!==undefined&&key>firstBlocked);
    }
    return blocked.has(key);
  }
  return <div className={`date-picker ${styles.calendar}`}><DayPicker formatters={{formatWeekdayName:date=>date.toLocaleDateString("en-US",{weekday:"narrow"})}} hideNavigation={hideNavigation} hideWeekdays={hideWeekdays} mode="range" selected={value} onSelect={range=>{if(range?.from&&range.to){const start=toDateString(range.from),finish=toDateString(range.to),nights=countNights(start,finish);if(validateStay(start,finish,bookedRanges)||nights<minNights||nights>maxNights)return;}onChange(range);}} numberOfMonths={numberOfMonths} defaultMonth={value?.from??today} disabled={disabled} modifiers={{booked:date=>blocked.has(toDateString(date))}} modifiersClassNames={{booked:"booked-day"}} min={minNights} max={maxNights} startMonth={today} endMonth={end} showOutsideDays={false} labels={{labelDayButton:(date,modifiers)=>{
    const label=date.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
    return `${modifiers.today?"Today, ":""}${label}${modifiers.selected?", selected":""}${modifiers.booked?", booked":""}${modifiers.disabled?", unavailable":""}`;
  }}}/></div>;
}
