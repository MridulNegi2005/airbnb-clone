"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, List, Map } from "lucide-react";
import dynamic from "next/dynamic";
import { useListings, type InitialListings } from "@/hooks/use-listings";
import { useSearch } from "@/hooks/use-search";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { ListingCard } from "@/components/listings/listing-card";
const ExploreMap=dynamic(()=>import("@/components/maps").then(module=>module.ExploreMap),{loading:()=> <div role="status" style={{height:"100%",minHeight:400,background:"var(--surface)",display:"grid",placeContent:"center"}}>Loading map…</div>});
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
  const desktopMap=useSyncExternalStore(subscribeDesktop,desktopSnapshot,()=>false);
  const isMap=params.get("view")==="map"||(desktopMap&&params.get("view")!=="list");
  const listings = useListings(homepage || params.get("view") === "map" ? { ...query, page_size: 50 } : query, initialData);
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = listings;
  const { blocked, record } = useApiCooldown();
  useEffect(() => { record(listings.error); }, [listings.error, record]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersMounted,setFiltersMounted]=useState(false);
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const all = listings.data?.pages.flatMap((page) => page.items) ?? [];
  const bounds: MapBounds | undefined = query.sw_lat !== undefined && query.sw_lng !== undefined && query.ne_lat !== undefined && query.ne_lng !== undefined ? { south: query.sw_lat, west: query.sw_lng, north: query.ne_lat, east: query.ne_lng } : undefined;
  function searchBounds(next: MapBounds) {
    const values = { sw_lat: next.south.toFixed(4), sw_lng: next.west.toFixed(4), ne_lat: next.north.toFixed(4), ne_lng: next.east.toFixed(4) };
    if (Object.entries(values).some(([key, value]) => params.get(key) !== value)) update(values, false, true);
  }
  useEffect(() => {
    if (homepage || !sentinel.current || !hasNextPage || isFetchNextPageError || blocked || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting && !isFetchingNextPage) void fetchNextPage();
    }, { rootMargin: "800px" });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [homepage, hasNextPage, isFetchingNextPage, isFetchNextPageError, blocked, fetchNextPage]);
  if(homepage) return <section className={styles.homepage} aria-label="Discover homes"><h1 className="sr-only">Airbnb clone homepage</h1>{listings.isPending?<HomepageSkeleton/>:listings.isError&&!listings.data?<div className={styles.state}><h2>Unable to load homes</h2><p>Please try again in a moment.</p><button className={styles.outline} disabled={blocked} onClick={()=>void listings.refetch()}>Try again</button></div>:all.length===0?<div className={styles.state}><h2>No homes available yet</h2><p>Check back for new places to stay.</p></div>:homeRows(all).map((row,index)=><HomeListingRow key={row.title} title={row.title} items={row.items} priority={index<2} onBrowse={()=>{const cities=new Set(row.items.map(item=>item.city));if(cities.size===1)update({location:row.items[0]?.city,search:"1",view:window.innerWidth>=1128?"map":undefined},true);else update({search:"1",view:window.innerWidth>=1128?"map":undefined,sw_lat:String(Math.min(...row.items.map(item=>item.latitude))-.015),sw_lng:String(Math.min(...row.items.map(item=>item.longitude))-.015),ne_lat:String(Math.max(...row.items.map(item=>item.latitude))+.015),ne_lng:String(Math.max(...row.items.map(item=>item.longitude))+.015)},true);}}/>)}</section>;
  return <>
    <CategoryBar onFilters={() => {setFiltersMounted(true);setFiltersOpen(true);}} />
    <section className={`${styles.page} ${isMap ? styles.mapView : !params.get("view")?styles.autoMapView:""}`} >
      <h1 className="sr-only">Find your next stay</h1>
      <section className={styles.listPane} aria-label="Available stays">
      <h2 className="sr-only">Places to stay</h2>
      {listings.isPending ? <ListingSkeleton /> : listings.isError && !listings.data ? <div className={styles.state}><h2 className="text-[22px] font-semibold">Something went wrong</h2><p>We couldn&apos;t load the stays. Please try again.</p><button className={styles.outline} disabled={blocked} onClick={() => void listings.refetch()}>Try again</button></div> : all.length === 0 ? <div className={styles.state}><h2 className="text-[22px] font-semibold">No exact matches</h2><p>Try changing or removing some of your filters or adjusting your search area.</p><button className={styles.outline} onClick={() => update({}, true)}>Remove all filters</button></div> : <>
        {params.toString() && <p className={styles.count}>{listings.data?.pages[0]?.total} stays{params.get("location") ? ` in ${params.get("location")}` : ""}</p>}
        <div className={styles.grid}>{all.map((listing, index) => <div key={listing.id} className={hoveredId === listing.id ? styles.hoveredCard : undefined} onMouseEnter={() => setHoveredId(listing.id)} onMouseLeave={() => setHoveredId(null)}><ListingCard listing={listing} priority={index<2} imageSizes={isMap?"(min-width:1640px) calc((100vw - 192px) / 6), (min-width:1128px) calc((100vw - 172px) / 4), (min-width:744px) calc((100vw - 96px) / 2), calc(100vw - 48px)":undefined} searchParams={params.toString()} /></div>)}</div>
        {listings.isFetchingNextPage && <div className="mt-10"><ListingSkeleton count={4} /></div>}
        {listings.hasNextPage && <div ref={sentinel} className={styles.more}><button className={styles.darkButton} disabled={listings.isFetchingNextPage || blocked} onClick={() => void listings.fetchNextPage()}>{listings.isFetchingNextPage ? "Loading stays..." : "Show more"}</button></div>}
        {listings.isFetchNextPageError && <p className="text-center text-error">More stays could not be loaded. Use Show more to try again.</p>}
      </>}
      </section>
      {!isMap&&!params.get("view")&&<aside className={`${styles.mapPane} ${styles.mapPlaceholder}`} aria-label="Map of available stays"><div role="status">Loading map…</div></aside>}
      {isMap && <aside className={styles.mapPane} aria-label="Map of available stays"><ExploreMap listings={all} bounds={bounds} onBoundsChange={searchBounds} hoveredListingId={hoveredId} onHoverListing={setHoveredId} searchParams={params.toString()} /></aside>}
    </section>
    {(all.length > 0 || isMap) && <button className={styles.mapToggle} onClick={() => update({ view: isMap ? "list" : "map" })}>{isMap ? "Show list" : "Show map"}{isMap ? <List size={16} /> : <Map size={16} />}</button>}
    {filtersMounted&&<FiltersModal open={filtersOpen} onClose={() => setFiltersOpen(false)} prices={all.map(listing=>listing.price_per_night)} />}
  </>;
}




function homeRows(listings: Listing[]) {
  const groups = [
    { title: "Popular homes in Bengaluru", cities: ["Bengaluru"] },
    { title: "Getaways in the Western Ghats", cities: ["Coorg", "Chikkamagaluru", "Sakleshpur"] },
    { title: "Stay near Bengaluru", cities: ["Nandi Hills", "Kanakapura", "Ramanagara", "Hosur"] },
    { title: "Places to stay around Kabini", cities: ["Kabini", "Bandipur", "BR Hills", "Mysuru", "Shivanasamudra"] },
  ];
  const used = new Set<string>();
  const rows = groups.map(group => {group.cities.forEach(city=>used.add(city));return {title:group.title,items:listings.filter(listing=>group.cities.includes(listing.city))};}).filter(row=>row.items.length);
  const extraCities=[...new Set(listings.map(listing=>listing.city))].filter(city=>!used.has(city));
  extraCities.forEach(city=>rows.push({title:`Homes in ${city}`,items:listings.filter(listing=>listing.city===city)}));
  return rows;
}

function HomeListingRow({ title, items, priority, onBrowse }: { title: string; items: Listing[]; priority: boolean; onBrowse: () => void }) {
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
    <div className={styles.rowHeading}><h2><button type="button" onClick={onBrowse}>{title}<span><ArrowRight size={14}/></span></button></h2><div className={styles.rowControls}><button type="button" aria-label={`Previous homes: ${title}`} disabled={position.start} onClick={()=>move(-1)}><ChevronLeft size={16}/></button><button type="button" aria-label={`Next homes: ${title}`} disabled={position.end} onClick={()=>move(1)}><ChevronRight size={16}/></button></div></div>
    <div ref={track} className={styles.homeTrack} onScroll={measure}>{visibleItems.map((listing,index)=><ListingCard key={listing.id} listing={listing} compact priority={priority&&index<2} imageSizes="(max-width:549px) 42vw, (max-width:743px) 29vw, (max-width:949px) calc((100vw - 116px) / 4), (max-width:1127px) calc((100vw - 128px) / 5), (max-width:1439px) calc((100vw - 171px) / 6), (min-width:1900px) calc((100vw - 207px) / 9), calc((100vw - 183px) / 7)"/>)}<HomeRowSeeAll items={visibleItems} title={title} onBrowse={onBrowse}/></div>
  </section>;
}
