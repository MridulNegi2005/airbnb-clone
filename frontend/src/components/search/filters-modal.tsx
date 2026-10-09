"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AirVent, Building2, ChevronDown, CookingPot, Dumbbell, Home, Hotel, House, KeyRound, ParkingCircle, Minus, Plus, Tv, WashingMachine, Waves, Wifi } from "lucide-react";
import { getAmenities, getCategories, getListings } from "@/lib/api";
import { toListingQuery } from "@/lib/search-params";
import { usePageSearch } from "@/hooks/use-search";
import { Modal } from "@/components/ui/modal";
import { AppImage } from "@/components/ui/app-image";
import { PriceRange } from "./price-range";
import styles from "./search.module.css";

type Draft = { place_type: string; min_price: string; max_price: string; bedrooms: string; beds: string; bathrooms: string; property_types: string; amenities: string; category:string };
const empty: Draft = { place_type: "", min_price: "", max_price: "", bedrooms: "", beds: "", bathrooms: "", property_types: "", amenities: "", category:"" };
const propertyTypes = [{ value: "house", label: "House", Icon: House }, { value: "apartment", label: "Apartment", Icon: Building2 }, { value: "guesthouse", label: "Guesthouse", Icon: Home }, { value: "hotel", label: "Hotel", Icon: Hotel }];

export function FiltersModal({ open, onClose, prices=[] }: { open: boolean; onClose: () => void; prices?:number[] }) {
  const [present,setPresent]=useState(open);
  if(open&&!present)setPresent(true);
  useEffect(()=>{if(open||!present)return;const delay=window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:150;const timer=window.setTimeout(()=>setPresent(false),delay);return()=>window.clearTimeout(timer);},[open,present]);
  if(!present)return null;
  return <FiltersForm open={open} onClose={onClose} prices={prices}/>;
}
function FiltersForm({ open,onClose,prices }: { open:boolean;onClose: () => void;prices:number[] }) {
  const { params, update } = usePageSearch();
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(Object.keys(empty).map((key) => [key, params.get(key) ?? ""])) as Draft);
  const [debounced, setDebounced] = useState(draft);
  const [showAll, setShowAll] = useState(false);
  const amenities = useQuery({ queryKey: ["amenities"], queryFn: ({ signal }) => getAmenities(signal),enabled:open });
  useEffect(() => { const timer = setTimeout(() => setDebounced(draft), 300); return () => clearTimeout(timer); }, [draft]);
  const defaultAmenities=["air-conditioning","wifi","tv","gym","iron","dryer"];
  const orderedAmenities=[...(amenities.data??[])].sort((a,b)=>{const first=defaultAmenities.indexOf(a.icon),second=defaultAmenities.indexOf(b.icon);return (first<0?defaultAmenities.length:first)-(second<0?defaultAmenities.length:second);});
  const categories=useQuery({queryKey:["categories"],queryFn:({signal})=>getCategories(signal),enabled:open});
  const queryParams = new URLSearchParams(params.toString());
  Object.entries(debounced).forEach(([key, value]) => value ? queryParams.set(key, value) : queryParams.delete(key));
  const countQuery = toListingQuery(queryParams);
  const count = useQuery({ queryKey: ["filter-count", countQuery], queryFn: ({ signal }) => getListings({ ...countQuery, page_size: 1 }, signal),enabled:open,placeholderData:keepPreviousData });
  function field(key: keyof Draft, value: string) { setDraft((current) => ({ ...current, [key]: value })); }
  function toggle(key: "property_types" | "amenities", value: string) {
    const values = draft[key].split(",").filter(Boolean);
    field(key, (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]).join(","));
  }
  const countLabel=count.data?`Show ${count.data.total} ${count.data.total===1?"place":"places"}`:"Show places";
  const footer = <div className={styles.filterFooter}><button className={styles.clear} disabled={!Object.values(draft).some(Boolean)} onClick={() => setDraft(empty)}>Clear all</button><button className={styles.darkButton} onClick={() => { update(draft); onClose(); }}><span className={styles.countLabel} data-loading={count.isFetching} aria-hidden={count.isFetching}>{countLabel}</span>{count.isFetching&&<><span className="sr-only">Checking places</span><span className={styles.countLoader} aria-hidden="true"><i/><i/><i/></span></>}</button></div>;
  return <Modal open={open} onClose={onClose} title="Filters" width={568} presentation="filters" footer={footer}><div className={styles.filterContent}>
    {amenities.data&&<section className={styles.filtersSection}><h2>Recommended for you</h2><div className={styles.recommended}>{[
      {name:"Washing machine",asset:"075ae1dc-92de-4410-8aa4-642ec5fe4868"},
      {name:"Free parking",asset:"8336ae3d-9381-4c82-bad9-e7730f04ef4e"},
      {name:"Kitchen",asset:"2cf526aa-5aec-463e-be85-c5a81b35db10"},
      {name:"Pool",asset:"bcceebe4-6b23-4063-88d5-8ebfb636e999"},
    ].map(({name,asset})=>{const amenity=amenities.data.find(item=>(name==="Washing machine"?item.icon==="washer":name==="Free parking"?item.icon==="parking":item.name.toLowerCase()===name.toLowerCase()));if(!amenity)return null;const selected=draft.amenities.split(",").includes(String(amenity.id));return <div key={name}><button type="button" aria-label={name} aria-pressed={selected} onClick={()=>toggle("amenities",String(amenity.id))}><AppImage src={`https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-recommended-filters/original/${asset}.png`} width={64} height={64} alt="" unoptimized/></button><span>{name}</span></div>;})}</div></section>}
    <section className={styles.filtersSection}><h2>Type of place</h2><div className={styles.segmented}>{[{ value: "", label: "Any type" }, { value: "private_room", label: "Room" }, { value: "entire_home", label: "Entire home" }].map((option) => <button key={option.value} className={draft.place_type === option.value ? styles.selected : ""} aria-pressed={draft.place_type === option.value} onClick={() => field("place_type", option.value)}>{option.label}</button>)}</div></section>
    <section className={styles.filtersSection}><h2>Price range</h2><p>Nightly price, before fees</p><PriceRange prices={prices} minimum={draft.min_price ? Number(draft.min_price) : 0} maximum={draft.max_price ? Number(draft.max_price) : 50000} onChange={(min, max) => setDraft((current) => ({ ...current, min_price: min === 0 ? "" : String(min), max_price: max >= 50000 ? "" : String(max) }))} /></section>
    <section className={styles.filtersSection}><h2>Rooms and beds</h2>{[{ key: "bedrooms", label: "Bedrooms" }, { key: "beds", label: "Beds" }, { key: "bathrooms", label: "Bathrooms" }].map(({ key, label }) => <div key={key} className={styles.guestRow}><span>{label}</span><FilterStepper label={label.toLowerCase()} value={Math.min(8,Number(draft[key as keyof Draft]) || 0)} onChange={(value) => field(key as keyof Draft, value ? String(value) : "")} /></div>)}</section>
    <section className={styles.filtersSection}><h2>Amenities</h2>{amenities.isPending ? <p className={styles.status}>Loading amenities...</p> : amenities.isError ? <p className={styles.status}>Amenities could not be loaded. <button className={styles.clear} onClick={() => void amenities.refetch()}>Try again</button></p> : <><div className={styles.amenities}>{(showAll ? orderedAmenities : orderedAmenities.slice(0, 6))?.map((amenity) => <label key={amenity.id} className={styles.amenityPill} data-selected={draft.amenities.split(",").includes(String(amenity.id))}><input className="sr-only" type="checkbox" checked={draft.amenities.split(",").includes(String(amenity.id))} onChange={() => toggle("amenities", String(amenity.id))} />{(() => {if(amenity.icon==="iron")return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 16h16l-2-7H9a5 5 0 0 0-5 5v2Zm5-7V6h6l1 3M4 19h16"/></svg>;const Icon=({gym:Dumbbell,dryer:WashingMachine,wifi:Wifi,washer:WashingMachine,parking:ParkingCircle,"air-conditioning":AirVent,kitchen:CookingPot,pool:Waves,"washing-machine":WashingMachine,tv:Tv,"free-parking":ParkingCircle,"self-check-in":KeyRound} as Record<string,typeof Wifi>)[amenity.icon]??Home;return <Icon size={20} strokeWidth={1.5}/>;})()}{amenity.icon==="dryer"?"Tumble dryer":amenity.icon==="washer"?"Washing machine":amenity.icon==="parking"?"Free parking":amenity.name}</label>)}</div>{(amenities.data?.length ?? 0) > 6 && <button className={`${styles.clear} ${styles.showAmenities}`} onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "Show more"}<ChevronDown size={12} style={{rotate:showAll?"180deg":undefined}}/></button>}</>}</section>
    <details className={`${styles.filtersSection} ${styles.filterAccordion}`}><summary>Property type<ChevronDown size={18}/></summary><div className={styles.tiles}>{propertyTypes.map(({ value, label, Icon }) => { const selected = draft.property_types.split(",").includes(value); return <button key={value} aria-pressed={selected} className={`${styles.tile} ${selected ? styles.tileSelected : ""}`} onClick={() => toggle("property_types", value)}><Icon size={32} strokeWidth={2} /><span>{label}</span></button>; })}</div></details>
    <details className={`${styles.filtersSection} ${styles.filterAccordion}`}><summary>Categories<ChevronDown size={18}/></summary><div className={styles.categoryChoices}>{categories.data?.map(category=><button key={category.id} type="button" aria-pressed={draft.category===category.slug} onClick={()=>field("category",draft.category===category.slug?"":category.slug)}>{category.name}</button>)}</div>{categories.isError&&<p className={styles.status}>Categories could not be loaded. <button className={styles.clear} onClick={()=>void categories.refetch()}>Try again</button></p>}</details>
    {count.isError && <p className="px-6 py-4 text-sm text-error">We couldn&apos;t check the number of stays. You can still apply your filters.</p>}
  </div></Modal>;
}



function FilterStepper({value,onChange,label}: {value:number;onChange:(value:number)=>void;label:string}) {
  return <div className="stepper"><button type="button" aria-label={`Decrease ${label}`} disabled={value<=0} onClick={()=>onChange(Math.max(0,value-1))}><Minus size={12}/></button><span aria-live="polite">{value?`${value}+`:"Any"}</span><button type="button" aria-label={`Increase ${label}`} disabled={value>=8} onClick={()=>onChange(Math.min(8,value+1))}><Plus size={12}/></button></div>;
}
