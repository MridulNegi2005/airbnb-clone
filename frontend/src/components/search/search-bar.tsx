"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AppImage } from "@/components/ui/app-image";

import { Building2, ChevronDown, Mountain, Search, Trees, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { parseDate, toDateString } from "@/lib/dates";
import { formatDateRange, formatGuests } from "@/lib/format";
import { useSearch } from "@/hooks/use-search";
import { GuestPanel, type GuestCounts } from "./guest-panel";
const DatePanel=dynamic(()=>import("./date-panel").then(module=>module.DatePanel),{loading:()=> <div role="status" style={{minHeight:330,padding:24}}>Loading calendar…</div>});
import styles from "./search.module.css";

type Segment = "where" | "checkin" | "checkout" | "who";
const destinations = [
  {name:"Bengaluru",subtitle:"For lively neighbourhoods and city stays",Icon:Building2,tone:"green"},
  {name:"Indiranagar",subtitle:"For cafes, boutiques and nightlife",Icon:Building2,tone:"rose"},
  {name:"Koramangala",subtitle:"For restaurants and places to unwind",Icon:Building2,tone:"green"},
  {name:"Whitefield",subtitle:"For a quieter city stay",Icon:Building2,tone:"sand"},
  {name:"Coorg",subtitle:"For coffee estates and green hills",Icon:Trees,tone:"green"},
  {name:"Chikkamagaluru",subtitle:"For mountain views and coffee country",Icon:Mountain,tone:"blue"},
  {name:"Nandi Hills",subtitle:"For a getaway near Bengaluru",Icon:Mountain,tone:"sand"},
  {name:"Kabini",subtitle:"For nature and riverside stays",Icon:Trees,tone:"green"},
  {name:"Mysuru",subtitle:"For heritage and architecture",Icon:Building2,tone:"rose"},
  {name:"Sakleshpur",subtitle:"For peaceful stays in the Western Ghats",Icon:Mountain,tone:"green"},
];
const subscribeMobile=(listener:()=>void)=>{const media=window.matchMedia("(max-width: 743px)");media.addEventListener("change",listener);return()=>media.removeEventListener("change",listener);};
const mobileSnapshot=()=>window.matchMedia("(max-width: 743px)").matches;
export function SearchBar({ onClose, homepage=false, startOpen=false, onActiveChange }: { onClose?: () => void; homepage?:boolean; startOpen?:boolean; onActiveChange?:(active:boolean)=>void }) {
  const { params } = useSearch();
  return <SearchForm key={params.toString()} onClose={onClose} homepage={homepage} startOpen={startOpen} onActiveChange={onActiveChange} />;
}
function SearchForm({ onClose, homepage, startOpen, onActiveChange }: { onClose?: () => void; homepage:boolean; startOpen?:boolean; onActiveChange?:(active:boolean)=>void }) {
  const { params, query, update } = useSearch();
  const [active, setActive] = useState<Segment | null>(homepage&&!startOpen?null:"where");
  const [location, setLocation] = useState(query.location ?? "");
  const [range, setRange] = useState<DateRange | undefined>(query.check_in ? { from: parseDate(query.check_in), to: query.check_out ? parseDate(query.check_out) : undefined } : undefined);
  const [guests, setGuests] = useState<GuestCounts>(() => ({ adults: Math.max(0, Number(params.get("adults")) || 0), children: Math.max(0, Number(params.get("children")) || 0), infants: Math.max(0, Number(params.get("infants")) || 0), pets: Math.max(0, Number(params.get("pets")) || 0) }));
  const [highlight, setHighlight] = useState(-1);
  const [moreSuggestions,setMoreSuggestions]=useState(false);
  const mobile=useSyncExternalStore(subscribeMobile,mobileSnapshot,()=>false);
  const root = useRef<HTMLDivElement>(null);
  const mobileSheet=useRef<HTMLDivElement>(null);
  const mobileOpen=mobile&&active!==null;
  const destinationInput = useRef<HTMLInputElement>(null);
  const mobileDestinationInput=useRef<HTMLInputElement>(null);
  useEffect(() => { if (!startOpen) return; const frame=requestAnimationFrame(() => (mobile?mobileDestinationInput:destinationInput).current?.focus({preventScroll:true})); return () => cancelAnimationFrame(frame); }, [startOpen,mobile]);
  const checkInId = useId();
  const suggestionsId = useId();
  useEffect(() => { if (!mobile && active === "checkin") document.getElementById(checkInId)?.focus({preventScroll:true}); }, [active, checkInId,mobile]);

  function activate(segment:Segment|null) { setActive(segment); onActiveChange?.(segment!==null); }
  const suggestions = destinations.filter(({name}) => !location.trim() || name.toLowerCase().split(/[\s,]+/).some((word) => word.startsWith(location.trim().toLowerCase())));
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if(event.defaultPrevented||(event.target instanceof Element&&event.target.closest('[role="dialog"]')&&event.target.closest('[role="dialog"]')!==mobileSheet.current))return; if (event.key === "Escape") { setActive(null); onActiveChange?.(false); onClose?.(); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)&&!mobileSheet.current?.contains(event.target)&&!(event.target instanceof Element&&event.target.closest('[role="dialog"]'))) { setActive(null); onActiveChange?.(false); onClose?.(); } };
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [onClose,onActiveChange]);
  useEffect(()=>{
    if(!mobileOpen)return;
    const previousOverflow=document.documentElement.style.overflow;
    const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    document.documentElement.style.overflow="hidden";
    function trap(event:KeyboardEvent){
      if(event.key!=="Tab"||!mobileSheet.current?.contains(document.activeElement))return;
      const elements=Array.from(mobileSheet.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')).filter(element=>element.getClientRects().length);
      const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    const frame=requestAnimationFrame(()=>(mobileDestinationInput.current??mobileSheet.current?.querySelector<HTMLElement>("button"))?.focus({preventScroll:true}));
    document.addEventListener("keydown",trap);
    return()=>{cancelAnimationFrame(frame);document.documentElement.style.overflow=previousOverflow;document.removeEventListener("keydown",trap);if(opener?.isConnected)opener.focus({preventScroll:true});};
  },[mobileOpen]);
  function submit() {
    update({ search: "1", view:window.innerWidth>=1128?"map":undefined, sw_lat: undefined, sw_lng: undefined, ne_lat: undefined, ne_lng: undefined, location: location.trim() || undefined, checkin: range?.from && range.to ? toDateString(range.from) : undefined, checkout: range?.to ? toDateString(range.to) : undefined, ...Object.fromEntries(Object.entries(guests).map(([key, value]) => [key, value ? String(value) : undefined])) });
    setActive(null); onActiveChange?.(false); onClose?.();
  }
  function select(city: string) { setLocation(city); activate("checkin"); }
  function destinationKey(event:ReactKeyboardEvent<HTMLInputElement>) {
    if(event.key==="ArrowDown"){event.preventDefault();setHighlight(value=>Math.min(value+1,suggestions.length-1));}
    if(event.key==="ArrowUp"){event.preventDefault();setHighlight(value=>Math.max(0,value-1));}
    if(event.key==="Enter"){event.preventDefault();const choice=suggestions[highlight];if(choice)select(choice.name);else activate("checkin");}
  }
  const dateActive=active==="checkin"||active==="checkout";
  const guestValue=guests.adults+guests.children+guests.infants+guests.pets?formatGuests(guests):"Add guests";
  function changeRange(value:DateRange|undefined){setRange(value);activate(!value?.from?"checkin":value.to&&!mobile?"who":"checkout");}
  const destinationRows=<>{suggestions.length===0?<p className={styles.status}>Search for &quot;{location}&quot; or try another destination.</p>:suggestions.map(({name,subtitle,Icon,tone},index)=><button key={name} type="button" id={`${suggestionsId}-${index}`} role="option" aria-selected={highlight===index} className={`${styles.suggestion} ${highlight===index?styles.highlighted:""}`} onClick={()=>select(name)}><span className={styles.destinationIcon} data-tone={tone}><Icon size={26} strokeWidth={1.5}/></span><span>{name}<small>{subtitle}</small></span></button>)}</>;
  const destinationProps={role:"combobox","aria-expanded":active==="where","aria-label":"Search destinations","aria-autocomplete":"list" as const,"aria-controls":active==="where"?suggestionsId:undefined,"aria-activedescendant":highlight>=0?`${suggestionsId}-${highlight}`:undefined,placeholder:"Search destinations",maxLength:100,value:location,onFocus:()=>activate("where"),onChange:(event:ChangeEvent<HTMLInputElement>)=>{setLocation(event.target.value);setHighlight(-1);},onKeyDown:destinationKey};
  const clearLocation=<button type="button" className={styles.segmentClear} aria-label="Clear destination" onClick={()=>{setLocation("");setHighlight(-1);(mobile?mobileDestinationInput:destinationInput).current?.focus({preventScroll:true});}}><X size={12}/></button>;
  return <div ref={root} className={`${styles.root} ${homepage?styles.homepage:""}`}>
    {homepage&&<button type="button" data-search-bar className={styles.mobileEntry} aria-label="Start your search" aria-expanded={mobileOpen} aria-hidden={!mobile} inert={!mobile} onClick={()=>activate("where")}><Search size={16} strokeWidth={2.5}/><span>{location||"Start your search"}</span></button>}
    <div className={styles.desktopSearch} aria-hidden={mobile||mobileOpen} inert={mobile||mobileOpen}>
      <div data-search-bar className={`${styles.bar} ${active?styles.hasActive:""}`}>
        <div className={`${styles.segment} ${active==="where"?styles.active:""}`}><label><span className={styles.label}>Where</span><input ref={destinationInput} autoFocus={!homepage&&!mobile} className={styles.input} {...destinationProps}/></label>{location&&clearLocation}</div>
        <div className={`${styles.segmentGroup} ${dateActive&&homepage||active==="checkin"?styles.active:""}`}><button id={checkInId} className={styles.segment} onClick={()=>activate("checkin")} aria-expanded={dateActive&&homepage||active==="checkin"}><span className={styles.label}>{homepage?"When":"Check in"}</span><span className={styles.value}>{homepage&&range?.from&&range.to?formatDateRange(range.from,range.to):range?.from?range.from.toLocaleDateString("en-US",{month:"short",day:"numeric"}):"Add dates"}</span></button>{range?.from&&<button type="button" className={styles.segmentClear} aria-label={homepage?"Clear dates":"Clear check-in date"} onClick={()=>{setRange(undefined);activate("checkin");}}><X size={12}/></button>}</div>
        {!homepage&&<div className={`${styles.segmentGroup} ${active==="checkout"?styles.active:""}`}><button className={styles.segment} onClick={()=>activate("checkout")} aria-expanded={active==="checkout"}><span className={styles.label}>Check out</span><span className={styles.value}>{range?.to?range.to.toLocaleDateString("en-US",{month:"short",day:"numeric"}):"Add dates"}</span></button>{range?.to&&<button type="button" className={styles.segmentClear} aria-label="Clear check-out date" onClick={()=>{setRange(current=>current?.from?{from:current.from,to:undefined}:undefined);activate("checkout");}}><X size={12}/></button>}</div>}
        <div className={`${styles.segmentGroup} ${styles.who} ${active==="who"?styles.active:""}`}><button className={styles.segment} onClick={()=>activate("who")} aria-expanded={active==="who"}><span className={styles.label}>Who</span><span className={styles.value}>{guestValue}</span></button>{guestValue!=="Add guests"&&<button type="button" className={`${styles.segmentClear} ${styles.guestClear}`} aria-label="Clear guests" onClick={()=>setGuests({adults:0,children:0,infants:0,pets:0})}><X size={12}/></button>}</div>
        <button className={styles.searchButton} aria-label="Search stays" onClick={submit}><Search size={18} strokeWidth={3}/><span>Search</span></button>
      </div>
      {!mobile&&active==="where"&&<div className={`${styles.panel} ${styles.wherePanel}`} ><h2>Suggested destinations</h2><div id={suggestionsId} role="listbox" aria-label="Suggested destinations">{destinationRows}</div></div>}
      {!mobile&&dateActive&&<div className={`${styles.panel} ${styles.datesPanel}`}><DatePanel value={range} onChange={changeRange}/></div>}
      {!mobile&&active==="who"&&<div className={`${styles.panel} ${styles.guestPanel}`}><GuestPanel guests={guests} onChange={setGuests}/></div>}
    </div>
    {mobile&&active&&createPortal(<div ref={mobileSheet} className={styles.mobileSheet} role="dialog" aria-modal="true" aria-label="Search stays">
      <button className={styles.mobileClose} aria-label="Close search" onClick={()=>{activate(null);onClose?.();}}><X size={16}/></button>
      <nav className={styles.mobileTypes} aria-label="Search type">{[
        {name:"Homes",asset:"a32adab1-f9df-47e1-a411-bdff91b579c3"},
        {name:"Experiences",asset:"e47ab655-027b-4679-b2e6-df1c99a5c33d"},
        {name:"Services",asset:"3d67e9a9-520a-49ee-b439-7b3a75ea814d"},
      ].map(({name,asset})=><button key={name} type="button" aria-pressed={name==="Homes"} onClick={()=>{if(name!=="Homes")toast(`${name} are coming soon`);}}><AppImage src={`https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/${asset}.png?im_w=120`} width={40} height={40} alt="" unoptimized/><span>{name}</span></button>)}</nav>
      <section className={`${styles.mobileCard} ${active==="where"?styles.mobileExpanded:""}`}>
        {active==="where"?<><h2>Where?</h2><div className={styles.mobileInput}><Search size={18}/><input ref={mobileDestinationInput} {...destinationProps}/>{location&&clearLocation}</div><div id={suggestionsId} role="listbox" aria-label="Suggested destinations" className={`${styles.mobileSuggestions} ${moreSuggestions?styles.moreSuggestions:""}`}><p className={styles.mobileSuggestionTitle}>Suggested destinations</p>{destinationRows}</div><button type="button" className={styles.moreSuggestionsButton} aria-label={moreSuggestions?"Show fewer suggestions":"Show additional suggestions"} aria-expanded={moreSuggestions} onClick={()=>setMoreSuggestions(value=>!value)}><ChevronDown size={16} style={{rotate:moreSuggestions?"180deg":undefined}}/></button></>:<button className={styles.mobileSummary} onClick={()=>activate("where")}><span>Where</span><strong>{location||"I’m flexible"}</strong></button>}
      </section>
      <section className={`${styles.mobileCard} ${dateActive?styles.mobileExpanded:""}`}>
        {dateActive?<><h2>When?</h2><DatePanel value={range} onChange={changeRange}/></>:<button className={styles.mobileSummary} onClick={()=>activate("checkin")}><span>When</span><strong>{range?.from&&range.to?formatDateRange(range.from,range.to):"Add dates"}</strong></button>}
      </section>
      <section className={`${styles.mobileCard} ${active==="who"?styles.mobileExpanded:""}`}>
        {active==="who"?<><h2>Who?</h2><GuestPanel guests={guests} onChange={setGuests}/></>:<button className={styles.mobileSummary} onClick={()=>activate("who")}><span>Who</span><strong>{guestValue}</strong></button>}
      </section>
      <div className={styles.mobileFooter}>{dateActive?<><button className={styles.clear} onClick={()=>setRange(undefined)}>Reset</button><button className={styles.darkButton} onClick={()=>activate("who")}>Next</button></>:<><button className={styles.clear} onClick={()=>{setLocation("");setRange(undefined);setGuests({adults:0,children:0,infants:0,pets:0});setHighlight(-1);}}>Clear all</button><button className={styles.mobileSearch} onClick={submit}><Search size={18}/>Search</button></>}</div>
    </div>,document.body)}
  </div>;
}
