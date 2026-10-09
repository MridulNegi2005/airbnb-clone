"use client";

import { Component, useCallback, useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import { createPortal, flushSync } from "react-dom";
import { APIProvider, AdvancedMarker, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useQuery } from "@tanstack/react-query";
import { Maximize2, Minus, Plus, SlidersHorizontal, MapPin, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { getServiceArea } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { ListingCard } from "@/components/listings/listing-card";
import type { MapBounds } from "@/types/api";
import type { ExploreMapProps, LocationMapProps } from "./types";
import styles from "./maps.module.css";

export const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const fullscreenSpring="linear(0 0%, 0.15794349142280711 9.090909090909092%, 0.4146686698630492 18.18181818181818%, 0.6303103850844771 27.27272727272727%, 0.7802275692100804 36.36363636363636%, 0.8751011408890221 45.45454545454545%, 0.9317564666924485 54.54545454545455%, 0.9642434451985746 63.63636363636364%, 0.9823049252758026 72.72727272727273%, 0.992097579596505 81.81818181818183%, 0.9972943925635941 90.9090909090909%, 1 100%)";
export function MapUnavailable({ message = "Interactive maps are unavailable right now. You can still browse the stays in the list." }: { message?: string }) {
  return <div className={styles.unavailable} role="status"><MapPin size={32} strokeWidth={1.5} /><h3>Map unavailable</h3><p>{message}</p></div>;
}
export function MapProvider({ children }: { children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const mapWindow = window as Window & { gm_authFailure?: () => void };
    const previous = mapWindow.gm_authFailure;
    const onFailure = () => { setFailed(true); previous?.(); };
    mapWindow.gm_authFailure = onFailure;
    return () => { if (mapWindow.gm_authFailure === onFailure) mapWindow.gm_authFailure = previous; };
  }, []);
  if (!apiKey || !mapId) return <MapUnavailable />;
  return <MapErrorBoundary><APIProvider apiKey={apiKey} region="IN" language="en" onError={() => setFailed(true)}><div style={{height:"100%",display:failed?"none":undefined}}>{children}</div>{failed&&<MapUnavailable message="The map could not be loaded. You can still browse the stays in the list." />}</APIProvider></MapErrorBoundary>;
}
class MapErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <MapUnavailable /> : this.props.children; }
}
export function useServiceArea() {
  return useQuery({ queryKey: ["service-area"], queryFn: ({ signal }) => getServiceArea(signal), staleTime: Infinity });
}
export function MapRestriction({ bounds }: { bounds: MapBounds }) {
  const map = useMap();
  useEffect(() => { map?.setOptions({ restriction: { latLngBounds: bounds, strictBounds: false }, zoomControl: true, zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM } }); }, [map, bounds]);
  return null;
}
export function PriceMap(props: ExploreMapProps) { return <div className={`${styles.container} ${styles.priceMap}`} style={{viewTransitionName:"search-map"}}><MapProvider><PriceMapContent {...props} /></MapProvider></div>; }
function searchIdentity(searchParams = "") {
  const params = new URLSearchParams(searchParams);
  for (const key of ["sw_lat", "sw_lng", "ne_lat", "ne_lng", "view", "page"]) params.delete(key);
  params.sort();
  return params.toString();
}
function PriceMapContent({ listings, bounds, onBoundsChange, hoveredListingId, onHoverListing, searchParams, loading=false }: ExploreMapProps) {
  const area = useServiceArea();
  const [selected, setSelected] = useState<number | null>(null);
  const [previewPosition,setPreviewPosition]=useState({x:0,below:false});
  const [visited, setVisited] = useState<Set<number>>(new Set());
  const [panControls,setPanControls]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const closePreview=useCallback(()=>{setSelected(null);onHoverListing?.(null);},[onHoverListing]);
  useEffect(()=>{if(selected===null||settingsOpen)return;const close=(event:KeyboardEvent)=>{if(event.key!=="Escape")return;event.preventDefault();closePreview();};document.addEventListener("keydown",close);return()=>document.removeEventListener("keydown",close);},[selected,settingsOpen,closePreview]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userMoved = useRef(false);
  const userInteraction = useRef(false);
  const boundsChange = useRef(onBoundsChange);
  useEffect(() => { boundsChange.current = onBoundsChange; }, [onBoundsChange]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function selectPin(event:MouseEvent<HTMLButtonElement>,id:number) {
    event.stopPropagation();
    const pin=event.currentTarget.getBoundingClientRect(),container=event.currentTarget.closest<HTMLElement>(`.${styles.container}`)?.getBoundingClientRect();
    if(container){const center=pin.x+pin.width/2;setPreviewPosition({x:Math.max(container.left+179.5,Math.min(center,container.right-179.5))-center,below:pin.top-container.top<370&&container.bottom-pin.bottom>=370});}
    setSelected(id);setVisited(current=>new Set(current).add(id));
  }
  const beforeFit = useCallback(() => {
    userMoved.current = false;
    userInteraction.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  if (area.isError) return <MapUnavailable message="The search area could not be loaded. Try reloading this page." />;
  if (!area.data) return <div className={styles.loading} role="status">Loading search area...</div>;
  const located=listings.filter(listing=>listing.latitude!==null&&listing.longitude!==null);
  const initialCenter = bounds?{lat:(bounds.north+bounds.south)/2,lng:(bounds.east+bounds.west)/2}:located.length?{lat:(Math.min(...located.map(listing=>listing.latitude!))+Math.max(...located.map(listing=>listing.latitude!)))/2,lng:(Math.min(...located.map(listing=>listing.longitude!))+Math.max(...located.map(listing=>listing.longitude!)))/2}:{ lat: (area.data.north + area.data.south) / 2, lng: (area.data.east + area.data.west) / 2 };
  return <><div style={{ height: "100%" }} onPointerDownCapture={() => { userInteraction.current = true; }} onWheelCapture={() => { userInteraction.current = true; }} onKeyDownCapture={(event) => { if (["+", "-", "=", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) userInteraction.current = true; }}><Map mapId={mapId} defaultCenter={initialCenter} defaultZoom={9} minZoom={1} maxZoom={21} gestureHandling="greedy" disableDefaultUI clickableIcons={false} onDragstart={() => { userMoved.current = true; }} onZoomChanged={() => { if (userInteraction.current) userMoved.current = true; }} onClick={closePreview} onIdle={(event) => {
    const moved = userMoved.current;
    userMoved.current = false;
    userInteraction.current = false;
    if (!onBoundsChange || !moved) return;
    const current = event.map.getBounds()?.toJSON();
    if (!current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; boundsChange.current?.(current); }, 400);
  }}><PriceMapControls popupOpen={selected!==null} panControls={panControls} onInteract={()=>{userInteraction.current=true;userMoved.current=true;}}/><AvailableMarkers><InitialBounds listings={listings} bounds={bounds} searchKey={searchIdentity(searchParams)} onFit={beforeFit} />{listings.filter((listing) => listing.latitude !== null && listing.longitude !== null).map((listing,index) => <AdvancedMarker key={listing.id} clickable anchorTop="-50%" anchorLeft="-50%" position={{ lat: listing.latitude!, lng: listing.longitude! }} zIndex={selected === listing.id || hoveredListingId === listing.id ? 9999 : 2000+listings.length-index}><div onMouseEnter={() => onHoverListing?.(listing.id)} onMouseLeave={() => onHoverListing?.(null)}><button className={`${styles.pin} ${visited.has(listing.id) ? styles.visited : ""} ${selected === listing.id || hoveredListingId === listing.id ? styles.selected : ""}`} aria-label={`${listing.title}, ${formatPrice(listing.price_per_night)} per night`} aria-pressed={selected === listing.id} onClick={event=>selectPin(event,listing.id)}>{formatPrice(listing.price_per_night)}</button>{selected === listing.id && <div className={styles.preview} role="dialog" aria-label={listing.title} data-below={previewPosition.below} style={{marginLeft:previewPosition.x}} onClick={event=>event.stopPropagation()} onKeyDown={event=>{if(event.key==="Escape"){event.stopPropagation();closePreview();}}}><ListingCard listing={listing} searchParams={searchParams} /><button className={styles.close} aria-label="Close listing preview" onClick={closePreview}><X size={16} /></button></div>}</div></AdvancedMarker>)}</AvailableMarkers></Map></div>{loading&&<div className={styles.mapLoader} role="status" aria-label="Updating places"><i/><i/><i/></div>}{onBoundsChange && <><button className={styles.settingsButton} aria-label="Map settings" aria-expanded={settingsOpen} onClick={()=>setSettingsOpen(!settingsOpen)}><SlidersHorizontal size={16}/></button><MapSettingsModal open={settingsOpen} onClose={()=>setSettingsOpen(false)} panControls={panControls} onPanControlsChange={()=>setPanControls(!panControls)}/></>}</>;
}
function MapSettingsModal({open,onClose,panControls,onPanControlsChange}:{open:boolean;onClose:()=>void;panControls:boolean;onPanControlsChange:()=>void}) {
  const [present,setPresent]=useState(open);
  if(open&&!present)setPresent(true);
  useEffect(()=>{if(open||!present)return;const delay=window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:150;const timer=window.setTimeout(()=>setPresent(false),delay);return()=>window.clearTimeout(timer);},[open,present]);
  if(!present)return null;
  return <Modal open={open} onClose={onClose} title="Map settings" footer={<button className={styles.settingsDone} onClick={onClose}>Done</button>}><div className={styles.mapSettings}><h2>Map settings</h2><p>Turn accessibility-focused map controls on or off</p><div className={styles.panSetting}><div><span>Map pan controls</span><p>Pan around the map with directional buttons</p></div><button role="switch" aria-label="Map pan controls" aria-checked={panControls} onClick={onPanControlsChange}><span>{panControls&&<Check size={12}/>}</span></button></div></div></Modal>;
}
function AvailableMarkers({children}:{children:ReactNode}) {
  const map=useMap();
  const [available,setAvailable]=useState(false);
  useEffect(()=>{
    if(!map)return;
    const update=()=>setAvailable(map.getMapCapabilities().isAdvancedMarkersAvailable===true);
    const listener=map.addListener("mapcapabilities_changed",update);
    const timer=window.setTimeout(update,500);
    return()=>{listener.remove();window.clearTimeout(timer);};
  },[map]);
  return available?children:null;
}
function PriceMapControls({onInteract,panControls,popupOpen}:{onInteract:()=>void;panControls:boolean;popupOpen:boolean}) {
  const map=useMap();
  const [zoomLevel,setZoomLevel]=useState(9);
  useEffect(()=>{if(!map)return;const update=()=>setZoomLevel(map.getZoom()??9);const listener=map.addListener("zoom_changed",update);update();return()=>listener.remove();},[map]);
  const [expanded,setExpanded]=useState(false);
  const fullscreenContainer=useRef<HTMLElement|null>(null);
  const transition=useRef<ViewTransition|null>(null);
  const setFullscreen=useCallback((container:HTMLElement,next:boolean)=>{const update=()=>flushSync(()=>{container.dataset.expanded=String(next);setExpanded(next);});transition.current?.skipTransition();document.documentElement.classList.add(styles.mapTransition!);document.documentElement.dataset.searchMapView=next?"expanded":"list";if(!window.matchMedia("(prefers-reduced-motion: reduce)").matches&&document.startViewTransition){const active=document.startViewTransition(update);transition.current=active;void active.ready.then(()=>{for(const animation of document.documentElement.getAnimations({subtree:true})){const effect=animation.effect;if(!(effect instanceof KeyframeEffect))continue;const pseudo=effect.pseudoElement??"";const group=/view-transition-(?:group|old|new)\(search-map(?:-control|-icon|-zoom)?\)/.test(pseudo);if((group&&animation instanceof CSSAnimation&&animation.animationName.startsWith("-ua-"))||pseudo==="::view-transition-image-pair(search-feed)")effect.updateTiming({duration:583.7719298245607,easing:fullscreenSpring});}}).catch(()=>{});void active.finished.finally(()=>{if(transition.current===active){transition.current=null;document.documentElement.classList.remove(styles.mapTransition!);delete document.documentElement.dataset.searchMapView;}});}else{update();document.documentElement.classList.remove(styles.mapTransition!);delete document.documentElement.dataset.searchMapView;}},[]);
  useEffect(()=>()=>{transition.current?.skipTransition();document.documentElement.classList.remove(styles.mapTransition!);delete document.documentElement.dataset.searchMapView;},[]);
  useEffect(()=>{if(!expanded)return;const overflow=document.documentElement.style.overflow;document.documentElement.style.overflow="hidden";const close=(event:KeyboardEvent)=>{if(event.key!=="Escape"||popupOpen)return;event.preventDefault();if(fullscreenContainer.current)setFullscreen(fullscreenContainer.current,false);};document.addEventListener("keydown",close);return()=>{document.documentElement.style.overflow=overflow;document.removeEventListener("keydown",close);};},[expanded,popupOpen,setFullscreen]);
  function pan(x:number,y:number){if(!map)return;onInteract();map.panBy(x,y);}
  function zoom(amount:number){if(!map)return;onInteract();map.setZoom(Math.max(1,Math.min(21,(map.getZoom()??9)+amount)));}
  return <>{expanded&&createPortal(<div className={styles.expandedBackdrop}/>,document.body)}<div className={styles.mapButtons}><button style={{viewTransitionName:"search-map-control"}} aria-label={expanded?"Exit full-screen map":"Show full-screen map"} aria-pressed={expanded} onClick={event=>{const container=event.currentTarget.closest<HTMLElement>(`.${styles.container}`);if(container){fullscreenContainer.current=container;setFullscreen(container,!expanded);}}}><span className={styles.fullscreenIcon} style={{viewTransitionName:"search-map-icon"}}>{expanded?<X size={16}/>:<Maximize2 size={16}/>}</span></button><div className={styles.zoomButtons} style={{viewTransitionName:"search-map-zoom"}}><button aria-label="Zoom in" disabled={zoomLevel>=21} onClick={()=>zoom(1)}><Plus size={16}/></button><button aria-label="Zoom out" disabled={zoomLevel<=1} onClick={()=>zoom(-1)}><Minus size={16}/></button>{panControls&&<>{[{label:"Pan up",x:0,y:-200,Icon:ChevronUp},{label:"Pan down",x:0,y:200,Icon:ChevronDown},{label:"Pan left",x:-200,y:0,Icon:ChevronLeft},{label:"Pan right",x:200,y:0,Icon:ChevronRight}].map(({label,x,y,Icon})=><button key={label} aria-label={label} onClick={()=>pan(x,y)}><Icon size={16} fill="currentColor"/></button>)}</>}</div></div></>;
}
function InitialBounds({ listings, bounds, searchKey, onFit }: Pick<ExploreMapProps, "listings" | "bounds"> & { searchKey: string; onFit: () => void }) {
  const map = useMap();
  const initialized = useRef<string | null>(null);
  const activeSearch = useRef<string | null>(null);
  const fitListener = useRef<google.maps.MapsEventListener | null>(null);
  useEffect(() => () => { fitListener.current?.remove(); }, []);
  useEffect(() => {
    if (!map) return;
    if (activeSearch.current !== searchKey) { fitListener.current?.remove(); fitListener.current = null; onFit(); activeSearch.current = searchKey; }
    if (initialized.current === searchKey || !listings.length) return;
    const fit = new google.maps.LatLngBounds();
    if (bounds) { fit.extend({ lat: bounds.south, lng: bounds.west }); fit.extend({ lat: bounds.north, lng: bounds.east }); }
    else listings.forEach((listing) => { if (listing.latitude !== null && listing.longitude !== null) fit.extend({ lat: listing.latitude, lng: listing.longitude }); });
    if (!fit.isEmpty()) {
      onFit();
      fitListener.current?.remove();
      // fitBounds can zoom a single result to a rooftop. Correct only this fit,
      // once its camera settles; later user zoom remains unrestricted.
      fitListener.current = google.maps.event.addListenerOnce(map, "idle", () => {
        fitListener.current = null;
        onFit(); map.moveCamera({ center: fit.getCenter(), zoom: Math.min(15,map.getZoom()??15) });
      });
      map.fitBounds(fit, 60);
      initialized.current = searchKey;
    }
  }, [map, listings, bounds, searchKey, onFit]);
  return null;
}
export function LocationMap({ latitude, longitude, approximate = false, label }: LocationMapProps & { approximate?: boolean }) {
  if (latitude === null || longitude === null) return <MapUnavailable message="Location information is unavailable for this stay." />;
  return <div className={`${styles.container} ${styles.location}`}><MapProvider><LocationMapContent latitude={latitude} longitude={longitude} approximate={approximate} label={label} /></MapProvider></div>;
}
function LocationMapContent({ latitude, longitude, approximate, label }: { latitude: number; longitude: number; approximate: boolean; label?: string }) {
  const area = useServiceArea();
  const [interacted, setInteracted] = useState(false);
  if (area.isError) return <MapUnavailable message="The location map could not load its search area. Try reloading this page." />;
  if (!area.data) return <div className={styles.loading} role="status">Loading location...</div>;
  return <><Map mapId={mapId} defaultCenter={{ lat: latitude, lng: longitude }} defaultZoom={14} gestureHandling="greedy" scrollwheel={interacted} disableDefaultUI clickableIcons={false} onClick={() => setInteracted(true)}>{area.data && <MapRestriction bounds={area.data} />}{approximate ? <LocationCircle latitude={latitude} longitude={longitude} /> : <AdvancedMarker position={{ lat: latitude, lng: longitude }}><span className={styles.exactPin} aria-label={label ?? "Booked stay location"}><MapPin size={20} /></span></AdvancedMarker>}</Map><p className={styles.locationHint}>{approximate ? "Exact location provided after booking." : label ?? "Your booked stay"}</p></>;
}
function LocationCircle({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  const library = useMapsLibrary("maps");
  useEffect(() => { if (!map || !library) return; const circle = new library.Circle({ map, center: { lat: latitude, lng: longitude }, radius: 400, fillColor: "#FF385C", fillOpacity: 0.2, strokeColor: "#FF385C", strokeOpacity: 0.35, strokeWeight: 1, clickable: false }); return () => circle.setMap(null); }, [map, library, latitude, longitude]);
  return null;
}
