"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { AppImage } from "@/components/ui/app-image";

import { Building2, ChevronDown, Mountain, Navigation, Search, Trees, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { parseDate, toDateString } from "@/lib/dates";
import { formatDateRange, formatGuests } from "@/lib/format";
import { useSearch } from "@/hooks/use-search";
import { GuestPanel, type GuestCounts } from "./guest-panel";
import { DatePanel } from "./date-panel";
import styles from "./search.module.css";

type Segment = "where" | "checkin" | "checkout" | "who";
const destinations = [
  {name:"Nearby",subtitle:"Find what’s around you",Icon:Navigation,tone:"blue"},
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
const subscribeReducedMotion=(listener:()=>void)=>{const media=window.matchMedia("(prefers-reduced-motion: reduce)");media.addEventListener("change",listener);return()=>media.removeEventListener("change",listener);};
const reducedMotionSnapshot=()=>window.matchMedia("(prefers-reduced-motion: reduce)").matches;
function SearchPanel({open,className,children,switching,style,onHeightChange}:{open:boolean;className:string|undefined;children:React.ReactNode;switching:boolean;style?:React.CSSProperties;onHeightChange?:(height:number)=>void}) {
  const [present,setPresent]=useState(open);
  const [mounted,setMounted]=useState(open);
  const panel=useRef<HTMLDivElement>(null);
  if(open&&!present)setPresent(true);
  if(open&&!mounted)setMounted(true);
  useEffect(()=>{if(open||!present)return;const timer=window.setTimeout(()=>setPresent(false),window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:75);return()=>window.clearTimeout(timer);},[open,present]);
  useEffect(()=>{if(!present||!onHeightChange||!panel.current)return;const element=panel.current;const observer=new ResizeObserver(()=>onHeightChange(element.offsetHeight));observer.observe(element);return()=>observer.disconnect();},[present,onHeightChange]);
  return mounted?<div ref={panel} hidden={!present} style={style} className={`${styles.panel} ${className}`} data-state={open?"open":"closing"} data-transition={switching?"switch":"open"} aria-hidden={!open} inert={!open}>{children}</div>:null;
}
export function SearchBar({ onClose, homepage=false, startOpen=false, onActiveChange }: { onClose?: () => void; homepage?:boolean; startOpen?:boolean; onActiveChange?:(active:boolean)=>void }) {
  const { params } = useSearch();
  return <SearchForm key={params.toString()} onClose={onClose} homepage={homepage} startOpen={startOpen} onActiveChange={onActiveChange} />;
}
function SearchForm({ onClose, homepage, startOpen, onActiveChange }: { onClose?: () => void; homepage:boolean; startOpen?:boolean; onActiveChange?:(active:boolean)=>void }) {
  const { params, query, update } = useSearch();
  const [active, setActive] = useState<Segment | null>(homepage&&!startOpen?null:"where");
  const [panelSwitch,setPanelSwitch]=useState(false);
  const [dateMode,setDateMode]=useState("Dates");
  const [datePanelHeight,setDatePanelHeight]=useState(544);
  const [surfaceSegment,setSurfaceSegment]=useState<Segment>(active??"where");
  if(active&&active!==surfaceSegment)setSurfaceSegment(active);
  const [location, setLocation] = useState(query.location ?? "");
  const [range, setRange] = useState<DateRange | undefined>(query.check_in ? { from: parseDate(query.check_in), to: query.check_out ? parseDate(query.check_out) : undefined } : undefined);
  const [guests, setGuests] = useState<GuestCounts>(() => ({ adults: Math.max(0, Number(params.get("adults")) || 0), children: Math.max(0, Number(params.get("children")) || 0), infants: Math.max(0, Number(params.get("infants")) || 0), pets: Math.max(0, Number(params.get("pets")) || 0) }));
  const [highlight, setHighlight] = useState(-1);
  const [moreSuggestions,setMoreSuggestions]=useState(false);
  const mobile=useSyncExternalStore(subscribeMobile,mobileSnapshot,()=>false);
  const reducedMotion=useSyncExternalStore(subscribeReducedMotion,reducedMotionSnapshot,()=>true);
  const root = useRef<HTMLDivElement>(null);
  const mobileSheet=useRef<HTMLDivElement>(null);
  const mobileOpen=mobile&&active!==null;
  const destinationInput = useRef<HTMLInputElement>(null);
  const mobileDestinationInput=useRef<HTMLInputElement>(null);
  const [mobilePresent,setMobilePresent]=useState(false);
  const [mobileSegment,setMobileSegment]=useState<Segment>("where");
  const closePending=useRef(false);
  if(mobileOpen&&!mobilePresent)setMobilePresent(true);
  const mobileClosing=mobilePresent&&!mobileOpen;
  const mobileDates=mobileSegment==="checkin"||mobileSegment==="checkout";
  const closeSearch=useCallback(()=>{
    setActive(null);onActiveChange?.(false);
    if(mobilePresent)closePending.current=true;
    else onClose?.();
  },[mobilePresent,onActiveChange,onClose]);
  useEffect(()=>{
    if(mobileOpen||!mobilePresent)return;
    const duration=reducedMotion?0:200;
    const timer=window.setTimeout(()=>{
      setMobilePresent(false);
      if(closePending.current){closePending.current=false;onClose?.();}
    },duration);
    return()=>window.clearTimeout(timer);
  },[mobileOpen,mobilePresent,onClose,reducedMotion]);
  useEffect(() => { if (!startOpen) return; const frame=requestAnimationFrame(() => (mobile?mobileDestinationInput:destinationInput).current?.focus({preventScroll:true})); return () => cancelAnimationFrame(frame); }, [startOpen,mobile]);
  const checkInId = useId();
  const suggestionsId = useId();
  useEffect(() => { if (!mobile && active === "checkin") document.getElementById(checkInId)?.focus({preventScroll:true}); }, [active, checkInId,mobile]);

  function activate(segment:Segment|null) { if(segment)setMobileSegment(segment);setPanelSwitch(active!==null&&segment!==active);setActive(segment); onActiveChange?.(segment!==null); }
  const suggestions = destinations.filter(({name}) => !location.trim() || name.toLowerCase().split(/[\s,]+/).some((word) => word.startsWith(location.trim().toLowerCase())));
  useEffect(()=>{
    if(highlight<0)return;
    const option=document.getElementById(`${suggestionsId}-${highlight}`);
    if(!option)return;
    let container=option.parentElement;
    while(container&&container!==document.body){
      if(container.scrollHeight>container.clientHeight&&/auto|scroll/.test(getComputedStyle(container).overflowY)){
        const row=option.getBoundingClientRect(),viewport=container.getBoundingClientRect();
        if(row.bottom>viewport.bottom)container.scrollTop+=row.bottom-viewport.bottom;
        else if(row.top<viewport.top)container.scrollTop-=viewport.top-row.top;
        break;
      }
      container=container.parentElement;
    }
  },[highlight,suggestionsId]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if(event.defaultPrevented||(event.target instanceof Element&&event.target.closest('[role="dialog"]')&&event.target.closest('[role="dialog"]')!==mobileSheet.current))return; if (event.key === "Escape")closeSearch(); };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)&&!mobileSheet.current?.contains(event.target)&&!(event.target instanceof Element&&event.target.closest('[role="dialog"]')))closeSearch(); };
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [closeSearch]);
  useEffect(()=>{
    if(!mobilePresent)return;
    const previousOverflow=document.documentElement.style.overflow;
    const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    document.documentElement.style.overflow="hidden";
    function trap(event:KeyboardEvent){
      if(mobileSheet.current?.inert&&event.key==="Tab"){event.preventDefault();return;}
      if(event.key!=="Tab"||!mobileSheet.current?.contains(document.activeElement))return;
      const elements=Array.from(mobileSheet.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),a[href],[tabindex="0"]')).filter(element=>element.getClientRects().length);
      const first=elements[0],last=elements[elements.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
    const frame=requestAnimationFrame(()=>(mobileDestinationInput.current??mobileSheet.current?.querySelector<HTMLElement>("button"))?.focus({preventScroll:true}));
    document.addEventListener("keydown",trap);
    return()=>{cancelAnimationFrame(frame);document.documentElement.style.overflow=previousOverflow;document.removeEventListener("keydown",trap);if(opener?.isConnected)opener.focus({preventScroll:true});};
  },[mobilePresent]);
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
      <div data-search-bar data-segment={active??undefined} className={`${styles.bar} ${active?styles.hasActive:""}`}>
        <span className={styles.activeIndicator} aria-hidden="true"/>
        <div className={`${styles.segment} ${active==="where"?styles.active:""}`}><label><span className={styles.label}>Where</span><input ref={destinationInput} autoFocus={!homepage&&!mobile} className={styles.input} {...destinationProps}/></label>{location&&clearLocation}</div>
        <div className={`${styles.segmentGroup} ${dateActive&&homepage||active==="checkin"?styles.active:""}`}><button id={checkInId} className={styles.segment} onClick={()=>activate("checkin")} aria-expanded={dateActive&&homepage||active==="checkin"}><span className={styles.label}>{homepage?"When":"Check in"}</span><span className={styles.value}>{homepage&&range?.from&&range.to?formatDateRange(range.from,range.to):range?.from?range.from.toLocaleDateString("en-US",{month:"short",day:"numeric"}):homepage&&dateMode==="Flexible"?"Anytime":"Add dates"}</span></button>{range?.from&&<button type="button" className={styles.segmentClear} aria-label={homepage?"Clear dates":"Clear check-in date"} onClick={()=>{setRange(undefined);activate("checkin");}}><X size={12}/></button>}</div>
        {!homepage&&<div className={`${styles.segmentGroup} ${active==="checkout"?styles.active:""}`}><button className={styles.segment} onClick={()=>activate("checkout")} aria-expanded={active==="checkout"}><span className={styles.label}>Check out</span><span className={styles.value}>{range?.to?range.to.toLocaleDateString("en-US",{month:"short",day:"numeric"}):"Add dates"}</span></button>{range?.to&&<button type="button" className={styles.segmentClear} aria-label="Clear check-out date" onClick={()=>{setRange(current=>current?.from?{from:current.from,to:undefined}:undefined);activate("checkout");}}><X size={12}/></button>}</div>}
        <div className={`${styles.segmentGroup} ${styles.who} ${active==="who"?styles.active:""}`}><button className={styles.segment} onClick={()=>activate("who")} aria-expanded={active==="who"}><span className={styles.label}>Who</span><span className={styles.value}>{guestValue}</span></button>{guestValue!=="Add guests"&&<button type="button" className={`${styles.segmentClear} ${styles.guestClear}`} aria-label="Clear guests" onClick={()=>setGuests({adults:0,children:0,infants:0,pets:0})}><X size={12}/></button>}</div>
        <button className={styles.searchButton} aria-label="Search stays" onClick={submit}><Search size={18} strokeWidth={3}/><span>Search</span></button>
      </div>
      {!mobile&&<><SearchPanel open={active!==null} switching={false} style={surfaceSegment!=="where"&&surfaceSegment!=="who"?{height:datePanelHeight}:undefined} className={`${styles.panelSurface} ${surfaceSegment==="who"?styles.guestPanel:surfaceSegment==="where"?styles.wherePanel:styles.datesPanel} ${dateMode==="Flexible"?styles.flexibleSurface:""}`}><></></SearchPanel><SearchPanel open={active==="where"} switching={panelSwitch} className={styles.wherePanel}><h2>Suggested destinations</h2><div id={suggestionsId} role="listbox" aria-label="Suggested destinations">{destinationRows}</div></SearchPanel><SearchPanel open={dateActive} onHeightChange={setDatePanelHeight} switching={panelSwitch} className={styles.datesPanel}><DatePanel search value={range} onChange={changeRange} selectedMode={dateMode} onModeChange={setDateMode}/></SearchPanel><SearchPanel open={active==="who"} switching={panelSwitch} className={styles.guestPanel}><GuestPanel guests={guests} onChange={setGuests}/></SearchPanel></>}
    </div>
    {mobilePresent&&createPortal(<div className={styles.mobileOverlay} onPointerDown={event=>{if(mobileClosing){event.preventDefault();event.stopPropagation();}}}><div ref={mobileSheet} className={styles.mobileSheet} data-state={mobileClosing?"closing":"open"} role="dialog" aria-modal={!mobileClosing} aria-hidden={mobileClosing} inert={mobileClosing} aria-label="Search stays">
      <button className={styles.mobileClose} aria-label="Close search" onClick={closeSearch}><X size={16}/></button>
      <nav className={styles.mobileTypes} aria-label="Search type">{[
        {name:"Homes",asset:"a32adab1-f9df-47e1-a411-bdff91b579c3"},
        {name:"Experiences",asset:"e47ab655-027b-4679-b2e6-df1c99a5c33d"},
        {name:"Services",asset:"3d67e9a9-520a-49ee-b439-7b3a75ea814d"},
      ].map(({name,asset})=><button key={name} type="button" aria-pressed={name==="Homes"} onClick={()=>{if(name!=="Homes")toast(`${name} are coming soon`);}}><AppImage src={`https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-search-bar-icons/original/${asset}.png?im_w=120`} width={40} height={40} alt="" unoptimized/><span>{name}</span></button>)}</nav>
      <section className={`${styles.mobileCard} ${mobileSegment==="where"?styles.mobileExpanded:""}`}>
        {mobileSegment==="where"?<><h2>Where?</h2><div className={styles.mobileInput}><Search size={18}/><input ref={mobileDestinationInput} {...destinationProps}/>{location&&clearLocation}</div><div id={suggestionsId} role="listbox" aria-label="Suggested destinations" className={`${styles.mobileSuggestions} ${moreSuggestions?styles.moreSuggestions:""}`}><p className={styles.mobileSuggestionTitle}>Suggested destinations</p>{destinationRows}</div><button type="button" className={styles.moreSuggestionsButton} aria-label={moreSuggestions?"Show fewer suggestions":"Show additional suggestions"} aria-expanded={moreSuggestions} onClick={()=>setMoreSuggestions(value=>!value)}><ChevronDown size={16} style={{rotate:moreSuggestions?"180deg":undefined}}/></button></>:<button className={styles.mobileSummary} onClick={()=>activate("where")}><span>Where</span><strong>{location||"I’m flexible"}</strong></button>}
      </section>
      <section className={`${styles.mobileCard} ${mobileDates?styles.mobileExpanded:""}`}>
        {mobileDates?<><h2>When?</h2><DatePanel search value={range} onChange={changeRange} selectedMode={dateMode} onModeChange={setDateMode}/></>:<button className={styles.mobileSummary} onClick={()=>activate("checkin")}><span>When</span><strong>{range?.from&&range.to?formatDateRange(range.from,range.to):"Add dates"}</strong></button>}
      </section>
      <section className={`${styles.mobileCard} ${mobileSegment==="who"?styles.mobileExpanded:""}`}>
        {mobileSegment==="who"?<><h2>Who?</h2><GuestPanel guests={guests} onChange={setGuests}/></>:<button className={styles.mobileSummary} onClick={()=>activate("who")}><span>Who</span><strong>{guestValue}</strong></button>}
      </section>
      <div className={styles.mobileFooter}>{mobileDates?<><button className={styles.clear} onClick={()=>setRange(undefined)}>Reset</button><button className={styles.darkButton} onClick={()=>activate("who")}>Next</button></>:<><button className={styles.clear} onClick={()=>{setLocation("");setRange(undefined);setGuests({adults:0,children:0,infants:0,pets:0});setHighlight(-1);}}>Clear all</button><button className={styles.mobileSearch} onClick={submit}><Search size={18}/>Search</button></>}</div>
    </div></div>,document.body)}
  </div>;
}
