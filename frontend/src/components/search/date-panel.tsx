"use client";

import type { DateRange } from "react-day-picker";
import { DayPicker } from "react-day-picker";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DatePicker } from "@/components/calendar/lazy-date-picker";
import styles from "./search.module.css";

type DatePanelProps={value:DateRange|undefined;onChange:(value:DateRange|undefined)=>void;selectedMode?:string;onModeChange?:(mode:string)=>void;search?:boolean};
function useMobileCalendar() {
  const [mobile, setMobile] = useState(false);
  useEffect(()=>{const media=window.matchMedia("(max-width: 743px)");const update=()=>setMobile(media.matches);update();media.addEventListener("change",update);return()=>media.removeEventListener("change",update);},[]);
  return mobile;
}
export function DatePanel({search=false,...props}:DatePanelProps) {
  return search?<SearchDatePanel {...props}/>:<LegacyDatePanel value={props.value} onChange={props.onChange}/>;
}
function LegacyDatePanel({value,onChange}:DatePanelProps) {
  const mobile=useMobileCalendar();
  return <><div className={styles.legacyDateMode}><span>Dates</span></div><div className={styles.legacyDateCalendar}><DatePicker value={value} onChange={onChange} numberOfMonths={mobile?12:2} hideNavigation={mobile}/></div><div className={styles.dateFooter}><span>Select your travel dates</span><button className={styles.clear} onClick={()=>onChange(undefined)}>Clear dates</button></div></>;
}
function SearchDatePanel({ value, onChange, selectedMode, onModeChange }:DatePanelProps) {
  const mobile=useMobileCalendar();
  const [localMode,setLocalMode]=useState("Dates");
  const mode=selectedMode??localMode;
  const setMode=onModeChange??setLocalMode;
  const [flexibility,setFlexibility]=useState(0);
  const [tripLength,setTripLength]=useState("");
  const [months,setMonths]=useState<number[]>([]);
  const today=new Date();today.setHours(0,0,0,0);
  const [month,setMonth]=useState(()=>value?.from??new Date());
  const [monthMotion,setMonthMotion]=useState<{next:Date;direction:"next"|"previous"}|null>(null);
  const monthStrip=useRef<HTMLDivElement>(null);
  const end=new Date(today);end.setMonth(end.getMonth()+12);
  const visibleMonth=monthMotion?.direction==="previous"?monthMotion.next:month;
  const calendarRows=Math.max(...[0,1].map(offset=>{const first=new Date(visibleMonth.getFullYear(),visibleMonth.getMonth()+offset,1);return Math.ceil((first.getDay()+new Date(first.getFullYear(),first.getMonth()+1,0).getDate())/7);}));
  function moveMonth(direction:"next"|"previous") {
    const next=new Date(month.getFullYear(),month.getMonth()+(direction==="next"?1:-1),1);
    if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)setMonth(next);
    else setMonthMotion({next,direction});
  }
  return <><div className={styles.dateMode} role="tablist" aria-label="Choose travel dates">{["Dates","Flexible"].map(tab=><button key={tab} type="button" role="tab" aria-selected={mode===tab} onClick={()=>setMode(tab)}>{tab}</button>)}</div>{mode==="Dates"?<><div className={styles.dateCalendar}>{!mobile&&<div className={styles.monthArrows}><button type="button" aria-label="Go to the Previous Month" disabled={!!monthMotion||month.getFullYear()===today.getFullYear()&&month.getMonth()<=today.getMonth()} onClick={()=>moveMonth("previous")}><ChevronLeft size={16}/></button><button type="button" aria-label="Go to the Next Month" disabled={!!monthMotion||month>=end} onClick={()=>moveMonth("next")}><ChevronRight size={16}/></button></div>}<div className={styles.calendarWindow} style={{height:mobile?undefined:70+calendarRows*53.5}}><div className={styles.calendarTrack} data-motion={monthMotion?.direction} onAnimationEnd={event=>{if(event.target===event.currentTarget&&monthMotion){setMonth(monthMotion.next);setMonthMotion(null);}}}><DayPicker month={monthMotion?.direction==="previous"?monthMotion.next:month} formatters={{formatWeekdayName:date=>date.toLocaleDateString("en-US",{weekday:"narrow"})}} mode="range" selected={value} onSelect={onChange} numberOfMonths={mobile?12:3} hideNavigation disabled={{before:today,after:end}} startMonth={today} endMonth={end} min={1} showOutsideDays={false}/></div></div></div><div className={styles.dateFlexibility} aria-label="Date flexibility">{[0,1,2,3,7,14].map(days=><button key={days} type="button" aria-pressed={flexibility===days} onClick={()=>setFlexibility(days)}>{days?<>± {days} {days===1?"day":"days"}</>:"Exact dates"}</button>)}</div>{value?.from&&<button className={styles.clearDates} onClick={()=>onChange(undefined)}>Clear dates</button>}</>:<div className={styles.flexibleDates}><h2>How long would you like to stay?</h2><div className={styles.tripLengths}>{["Weekend","Week","Month"].map(length=><button key={length} type="button" aria-pressed={tripLength===length} onClick={()=>setTripLength(length)}>{length}</button>)}</div><h2>When do you want to go?</h2><div className={styles.monthStrip}><div ref={monthStrip} className={styles.flexibleMonths}>{Array.from({length:12},(_,index)=>{const date=new Date(today.getFullYear(),today.getMonth()+index,1);return <button key={index} type="button" aria-pressed={months.includes(index)} onClick={()=>setMonths(current=>current.includes(index)?current.filter(item=>item!==index):[...current,index])}><Calendar size={32} strokeWidth={1.5}/><strong>{date.toLocaleDateString("en-US",{month:"long"})}</strong><span>{date.getFullYear()}</span></button>;})}</div><button className={styles.moreMonths} type="button" aria-label="Show more months" onClick={()=>monthStrip.current?.scrollBy({left:780,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"})}><ChevronRight size={16}/></button></div></div>}</>;
}
