"use client";

import { useEffect, useId, useRef, useState } from "react";
import dynamic from "next/dynamic";

import { MapPin, Search, X } from "lucide-react";
import type { DateRange } from "react-day-picker";

import { parseDate, toDateString } from "@/lib/dates";
import { formatDateRange, formatGuests } from "@/lib/format";
import { useSearch } from "@/hooks/use-search";
import { GuestPanel, type GuestCounts } from "./guest-panel";
const DatePanel=dynamic(()=>import("./date-panel").then(module=>module.DatePanel),{loading:()=> <div role="status" style={{minHeight:330,padding:24}}>Loading calendar…</div>});
import styles from "./search.module.css";

type Segment = "where" | "checkin" | "checkout" | "who";
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
  const [highlight, setHighlight] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const destinationInput = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!startOpen) return; const frame=requestAnimationFrame(() => destinationInput.current?.focus({preventScroll:true})); return () => cancelAnimationFrame(frame); }, [startOpen]);
  const checkInId = useId();
  const suggestionsId = useId();
  useEffect(() => { if (active === "checkin") document.getElementById(checkInId)?.focus(); }, [active, checkInId]);

  function activate(segment:Segment|null) { setActive(segment); onActiveChange?.(segment!==null); }
  const suggestions = ["Bengaluru", "Indiranagar", "Koramangala", "Whitefield", "Coorg", "Chikkamagaluru", "Nandi Hills", "Kabini", "Mysuru", "Sakleshpur"].filter((city) => !location.trim() || city.toLowerCase().split(/[\s,]+/).some((word) => word.startsWith(location.trim().toLowerCase())));
  useEffect(() => {
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setActive(null); onActiveChange?.(false); onClose?.(); } };
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) { setActive(null); onActiveChange?.(false); onClose?.(); } };
    document.addEventListener("keydown", key); document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", key); document.removeEventListener("pointerdown", outside); };
  }, [onClose,onActiveChange]);
  function submit() {
    update({ search: "1", sw_lat: undefined, sw_lng: undefined, ne_lat: undefined, ne_lng: undefined, location: location.trim() || undefined, checkin: range?.from && range.to ? toDateString(range.from) : undefined, checkout: range?.to ? toDateString(range.to) : undefined, ...Object.fromEntries(Object.entries(guests).map(([key, value]) => [key, value ? String(value) : undefined])) });
    setActive(null); onActiveChange?.(false); onClose?.();
  }
  function select(city: string) { setLocation(city); activate("checkin"); }
  return <div ref={root} className={`${styles.root} ${homepage?styles.homepage:""}`}>
    <button className={styles.mobileClose} aria-label="Close search" onClick={onClose}><X size={16} /></button>
    <div data-search-bar className={`${styles.bar} ${active ? styles.hasActive : ""}`}>
      <label className={`${styles.segment} ${active === "where" ? styles.active : ""}`}><span className={styles.label}>Where</span><input ref={destinationInput} autoFocus={!homepage} aria-label="Search destinations" aria-autocomplete="list" aria-controls={active==="where"?suggestionsId:undefined} className={styles.input} placeholder="Search destinations" maxLength={100} value={location} onFocus={() => activate("where")} onChange={(event) => { setLocation(event.target.value); setHighlight(0); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((value) => Math.min(value + 1, suggestions.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((value) => Math.max(0, value - 1)); } if (event.key === "Enter") { event.preventDefault(); const city = suggestions[highlight]; if (city) select(city); else { activate("checkin");  } } }} /></label>
      <button id={checkInId} className={`${styles.segment} ${(active === "checkin" || homepage&&active === "checkout") ? styles.active : ""}`} onClick={() => activate("checkin")} aria-expanded={active === "checkin" || homepage&&active === "checkout"}><span className={styles.label}>{homepage?"When":"Check in"}</span><span className={styles.value}>{homepage&&range?.from&&range.to?formatDateRange(range.from,range.to):range?.from ? range.from.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Add dates"}</span></button>
      {!homepage&&<button className={`${styles.segment} ${active === "checkout" ? styles.active : ""}`} onClick={() => activate("checkout")} aria-expanded={active === "checkout"}><span className={styles.label}>Check out</span><span className={styles.value}>{range?.to ? range.to.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Add dates"}</span></button>}
      <button className={`${styles.segment} ${styles.who} ${active === "who" ? styles.active : ""}`} onClick={() => activate("who")} aria-expanded={active === "who"}><span className={styles.label}>Who</span><span className={styles.value}>{guests.adults + guests.children + guests.infants + guests.pets ? formatGuests(guests) : "Add guests"}</span></button>
      <button className={styles.searchButton} aria-label="Search stays" onClick={submit}><Search size={18} strokeWidth={3} /><span>Search</span></button>
    </div>
    {active === "where" && <div className={`${styles.panel} ${styles.wherePanel}`} id={suggestionsId}><h2>Suggested destinations</h2>{suggestions.length === 0 ? <p className={styles.status}>Search for &quot;{location}&quot; or try another destination.</p> : suggestions.map((city, index) => <button key={city} className={`${styles.suggestion} ${highlight === index ? styles.highlighted : ""}`} onClick={() => select(city)}><span className={styles.destinationIcon}><MapPin size={24} /></span><span>{city}<small>Find places to stay</small></span></button>)}</div>}
    {(active === "checkin" || active === "checkout") && <div className={`${styles.panel} ${styles.datesPanel}`}><DatePanel value={range} onChange={(value) => { setRange(value); activate(value?.to ? "who" : "checkout"); }} /></div>}
    {active === "who" && <div className={`${styles.panel} ${styles.guestPanel}`}><GuestPanel guests={guests} onChange={setGuests} /></div>}
    <div className={styles.mobileFooter}><button className={styles.clear} onClick={() => { setLocation(""); setRange(undefined); setGuests({ adults: 0, children: 0, infants: 0, pets: 0 }); }}>Clear all</button>{range?.from && range.to && <span className="sr-only">{formatDateRange(range.from, range.to)}</span>}<button className={styles.mobileSearch} onClick={submit}><Search size={18} />Search</button></div>
  </div>;
}



