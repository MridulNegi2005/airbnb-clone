"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, List, Map, Tag } from "lucide-react";
import dynamic from "next/dynamic";
import { useListings, type InitialListings } from "@/hooks/use-listings";
import { useSearch } from "@/hooks/use-search";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { ListingCard } from "@/components/listings/listing-card";
const ExploreMap=dynamic(()=>import("@/components/maps").then(module=>module.ExploreMap),{loading:()=> <div role="status" style={{height:"100%",minHeight:400,background:"var(--surface)",display:"grid",placeContent:"center"}}>Loading map...</div>});
import type { ListingCard as Listing, MapBounds } from "@/types/api";
import { CategoryBar } from "./category-bar";
import { HomepageSkeleton, ListingSkeleton } from "./listing-skeleton";
import { HomeRowSeeAll } from "./home-row-see-all";
import styles from "./explore.module.css";

const FiltersModal=dynamic(()=>import("@/components/search/filters-modal").then(module=>module.FiltersModal));

const subscribeDesktop=(listener:()=>void)=>{const media=window.matchMedia("(min-width: 1128px)");media.addEventListener("change",listener);return()=>media.removeEventListener("change",listener);};
const desktopSnapshot=()=>window.matchMedia("(min-width: 1128px)").matches;

export function ExploreClient({ initialData }: { initialData?: InitialListings }) {
  const { params, query, update } = useSearch();
  const homepage = !params.size;
  const rawPage=Number(params.get("page"));
  const currentPage=Number.isInteger(rawPage)&&rawPage>0?rawPage:1;
  const desktopMap=useSyncExternalStore(subscribeDesktop,desktopSnapshot,()=>false);
  const isMap=params.get("view")==="map"||(desktopMap&&params.get("view")!=="list");
  const listings = useListings(homepage?{...query,page_size:50}:{...query,page:currentPage,page_size:20}, initialData);
  const { blocked, record } = useApiCooldown();
  useEffect(() => { record(listings.error); }, [listings.error, record]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const total=listings.data?.pages[0]?.total??0;
  const pageCount=Math.min(15,Math.ceil(total/20));
  function pageUrl(page:number) {
    const next=new URLSearchParams(params.toString());
    if(page===1)next.delete("page");else next.set("page",String(page));
    return `/?${next}`;
  }
  function goToPage(page:number) {
    if(page<1||page>pageCount||page===currentPage)return;
    window.history.pushState(null,"",pageUrl(page));
    window.scrollTo({top:0,behavior:"instant"});
  }
  const all = listings.data?.pages.flatMap((page) => page.items) ?? [];
  const bounds: MapBounds | undefined = query.sw_lat !== undefined && query.sw_lng !== undefined && query.ne_lat !== undefined && query.ne_lng !== undefined ? { south: query.sw_lat, west: query.sw_lng, north: query.ne_lat, east: query.ne_lng } : undefined;
  function searchBounds(next: MapBounds) {
    const values = { sw_lat: next.south.toFixed(4), sw_lng: next.west.toFixed(4), ne_lat: next.north.toFixed(4), ne_lng: next.east.toFixed(4) };
    if (Object.entries(values).some(([key, value]) => params.get(key) !== value)) update(values, false, true);
  }
  if(homepage) return <section className={styles.homepage} aria-label="Discover homes"><h1 className="sr-only">Airbnb clone homepage</h1>{(listings.isPending||listings.isPlaceholderData)?<HomepageSkeleton/>:listings.isError&&!listings.data?<div className={styles.state}><h2>Unable to load homes</h2><p>Please try again in a moment.</p><button className={styles.outline} disabled={blocked} onClick={()=>void listings.refetch()}>Try again</button></div>:all.length===0?<div className={styles.state}><h2>No homes available yet</h2><p>Check back for new places to stay.</p></div>:homeRows(all).map((row,index)=><HomeListingRow key={row.title} title={row.title} subtitle={row.subtitle} items={row.items} priority={index<2} onBrowse={()=>{const cities=new Set(row.items.map(item=>item.city));if(cities.size===1)update({location:row.items[0]?.city,search:"1",view:window.innerWidth>=1128?"map":undefined},true);else update({search:"1",view:window.innerWidth>=1128?"map":undefined,sw_lat:String(Math.min(...row.items.map(item=>item.latitude))-.015),sw_lng:String(Math.min(...row.items.map(item=>item.longitude))-.015),ne_lat:String(Math.max(...row.items.map(item=>item.latitude))+.015),ne_lng:String(Math.max(...row.items.map(item=>item.longitude))+.015)},true);}}/>)}</section>;
  return <>
    <CategoryBar onFilters={() => setFiltersOpen(true)} />
    <section className={`${styles.page} ${isMap ? styles.mapView : !params.get("view")?styles.autoMapView:""}`} >
      <section className={styles.listPane} style={{viewTransitionName:"search-feed"}} aria-label="Available stays">
      <h2 className="sr-only">Places to stay</h2>
      {listings.isPending||listings.isPlaceholderData ? <><div className={styles.resultsSkeletonHeader}><div className={`skeleton ${styles.resultsSkeletonHeading}`} /><div className={`skeleton ${styles.resultsSkeletonFees}`}/></div><ListingSkeleton count={20} /></> : listings.isError && !listings.data ? <div className={styles.state}><h2 className="text-[22px] font-semibold">Something went wrong</h2><p>We couldn&apos;t load the stays. Please try again.</p><button className={styles.outline} disabled={blocked} onClick={() => void listings.refetch()}>Try again</button></div> : all.length === 0 ? <div className={styles.state}><h2 className="text-[22px] font-semibold">No exact matches</h2><p>Try changing or removing some of your filters or adjusting your search area.</p><button className={styles.outline} onClick={() => update({min_price:undefined,max_price:undefined,place_type:undefined,bedrooms:undefined,beds:undefined,bathrooms:undefined,property_types:undefined,amenities:undefined,category:undefined})}>Remove all filters</button></div> : <>
        <div className={styles.resultsHeading}><h1 className={styles.count}>{total>1000?"Over 1,000":total.toLocaleString("en-IN")} {total===1?"home":"homes"}{params.get("location")?` in ${params.get("location")}`:""}</h1><span className={styles.fees}><Tag size={26} fill="#ff385c" stroke="white" strokeWidth={1.5}/>Prices include all fees</span></div>
        <div className={styles.grid}>{all.map((listing, index) => <div key={listing.id} className={hoveredId === listing.id ? styles.hoveredCard : undefined} onMouseEnter={() => setHoveredId(listing.id)} onMouseLeave={() => setHoveredId(null)}><ListingCard listing={listing} priority={index<2} imageSizes={isMap?"(min-width:1640px) calc((100vw - 192px) / 6), (min-width:1128px) calc((100vw - 172px) / 4), (min-width:744px) calc((100vw - 96px) / 2), calc(100vw - 48px)":undefined} searchParams={params.toString()} /></div>)}</div>
        {pageCount>0&&<nav className={styles.pagination} aria-label="Pagination"><button type="button" aria-label="Previous page" disabled={currentPage===1} onClick={()=>goToPage(currentPage-1)}><ChevronLeft size={16}/></button>{paginationPages(currentPage,pageCount).map((page,index)=>page===null?<span key={`ellipsis-${index}`}>&hellip;</span>:<a key={page} href={pageUrl(page)} aria-label={`Page ${page} of ${pageCount}`} aria-current={page===currentPage?"page":undefined} aria-disabled={page===currentPage} onClick={event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();goToPage(page);}}>{page}</a>)}<button type="button" aria-label="Next page" disabled={currentPage===pageCount} onClick={()=>goToPage(currentPage+1)}><ChevronRight size={16}/></button></nav>}

      </>}
      </section>
      {!isMap&&!params.get("view")&&<aside className={`${styles.mapPane} ${styles.mapPlaceholder}`} aria-label="Map of available stays"><div role="status">Loading map...</div></aside>}
      {isMap && <aside className={styles.mapPane} aria-label="Map of available stays"><ExploreMap listings={all} bounds={bounds} onBoundsChange={searchBounds} loading={listings.isFetching} hoveredListingId={hoveredId} onHoverListing={setHoveredId} searchParams={params.toString()} /></aside>}
    </section>
    {(all.length > 0 || isMap) && <button className={styles.mapToggle} onClick={() => update({ view: isMap ? "list" : "map" })}>{isMap ? "Show list" : "Show map"}{isMap ? <List size={16} /> : <Map size={16} />}</button>}
    <FiltersModal open={filtersOpen} onClose={() => setFiltersOpen(false)} prices={all.map(listing=>listing.price_per_night)} />
  </>;
}




function homeRows(listings: Listing[]) {
  const groups = [
    { title: "Popular homes in Bengaluru", subtitle: "Guests often rate these homes highly", cities: ["Bengaluru"] },
    { title: "Getaways in the Western Ghats", subtitle: "Coffee estates and misty hills", cities: ["Coorg", "Chikkamagaluru", "Sakleshpur"] },
    { title: "Stay near Bengaluru", subtitle: "Weekend escapes within a short drive", cities: ["Nandi Hills", "Kanakapura", "Ramanagara", "Hosur"] },
    { title: "Places to stay around Kabini", subtitle: "Riverside stays close to the forests", cities: ["Kabini", "Bandipur", "BR Hills", "Mysuru", "Shivanasamudra"] },
  ];
  const used = new Set<string>();
  const rows = groups.map(group => {group.cities.forEach(city=>used.add(city));return {title:group.title,subtitle:group.subtitle as string|undefined,items:listings.filter(listing=>group.cities.includes(listing.city))};}).filter(row=>row.items.length);
  const extraCities=[...new Set(listings.map(listing=>listing.city))].filter(city=>!used.has(city));
  extraCities.forEach(city=>rows.push({title:`Homes in ${city}`,subtitle:undefined,items:listings.filter(listing=>listing.city===city)}));
  return rows;
}

function HomeListingRow({ title, subtitle, items, priority, onBrowse }: { title: string; subtitle?: string; items: Listing[]; priority: boolean; onBrowse: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const visibleItems=items.slice(0,8);
  const [position, setPosition] = useState({ start: true, end: items.length <= 1 });
  function measure() {
    const element=track.current;
    if(element) setPosition({start:element.scrollLeft<2,end:element.scrollLeft+element.clientWidth>=element.scrollWidth-2});
  }
  useEffect(()=>{const element=track.current;if(!element)return;const observer=new ResizeObserver(()=>{setPosition({start:element.scrollLeft<2,end:element.scrollLeft+element.clientWidth>=element.scrollWidth-2});});observer.observe(element);return()=>observer.disconnect();},[]);
  function move(direction: number) {
    const element = track.current;
    if(element)element.scrollBy({left:direction*(element.clientWidth+12),behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  }
  return <section className={styles.homeRow} aria-label={title}>
    <div className={styles.rowHeading}><h2><button type="button" onClick={onBrowse}>{title}<span><ArrowRight size={14}/></span></button></h2><div className={styles.rowControls}><button type="button" aria-label={`Previous homes: ${title}`} disabled={position.start} onClick={()=>move(-1)}><ChevronLeft size={16}/></button><button type="button" aria-label={`Next homes: ${title}`} disabled={position.end} onClick={()=>move(1)}><ChevronRight size={16}/></button></div></div>{subtitle&&<p className={styles.rowSubtitle}>{subtitle}</p>}
    <div ref={track} className={styles.homeTrack} onScroll={measure}>{visibleItems.map((listing,index)=><ListingCard key={listing.id} listing={listing} compact priority={priority&&index<2} imageSizes="(max-width:549px) 42vw, (max-width:743px) 29vw, (max-width:949px) calc((100vw - 116px) / 4), (max-width:1127px) calc((100vw - 128px) / 5), (max-width:1439px) calc((100vw - 171px) / 6), (min-width:1900px) calc((100vw - 207px) / 9), calc((100vw - 183px) / 7)"/>)}<HomeRowSeeAll items={visibleItems} title={title} onBrowse={onBrowse}/></div>
  </section>;
}

function paginationPages(current:number,total:number):Array<number|null> {
  const visible=new Set([1,total,...Array.from({length:5},(_,index)=>current-2+index).filter(page=>page>0&&page<=total)]);
  if(current<=3)for(let page=1;page<=Math.min(4,total);page++)visible.add(page);
  if(current>=total-2)for(let page=Math.max(1,total-4);page<=total;page++)visible.add(page);
  const pages:Array<number|null>=[];
  [...visible].sort((a,b)=>a-b).forEach((page,index,array)=>{if(index&&page-(array[index-1]??page)>1)pages.push(null);pages.push(page);});
  return pages;
}
