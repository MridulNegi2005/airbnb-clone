"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { APIProvider, AdvancedMarker, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { useQuery } from "@tanstack/react-query";
import { MapPin, X } from "lucide-react";
import { getServiceArea } from "@/lib/api";
import { formatPrice } from "@/lib/format";
import { ListingCard } from "@/components/listings/listing-card";
import type { MapBounds } from "@/types/api";
import type { ExploreMapProps, LocationMapProps } from "./types";
import styles from "./maps.module.css";

export const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
export function MapUnavailable({ message = "Interactive maps are unavailable right now. You can still browse the stays in the list." }: { message?: string }) {
  return <div className={styles.unavailable} role="status"><MapPin size={32} strokeWidth={1.5} /><h3>Map unavailable</h3><p>{message}</p></div>;
}
export function MapProvider({ children }: { children: ReactNode }) {
  const [failed, setFailed] = useState(false);
  if (!apiKey || !mapId) return <MapUnavailable />;
  if (failed) return <MapUnavailable message="The map could not be loaded. You can still browse and book the stays in the list." />;
  return <APIProvider apiKey={apiKey} region="IN" language="en" onError={() => setFailed(true)}>{children}</APIProvider>;
}
export function useServiceArea() {
  return useQuery({ queryKey: ["service-area"], queryFn: ({ signal }) => getServiceArea(signal), staleTime: Infinity });
}
export function MapRestriction({ bounds }: { bounds: MapBounds }) {
  const map = useMap();
  useEffect(() => { map?.setOptions({ restriction: { latLngBounds: bounds, strictBounds: false }, zoomControl: true, zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM } }); }, [map, bounds]);
  return null;
}
export function PriceMap(props: ExploreMapProps) { return <div className={styles.container}><MapProvider><PriceMapContent {...props} /></MapProvider></div>; }
function PriceMapContent({ listings, bounds, onBoundsChange, hoveredListingId, onHoverListing, searchParams }: ExploreMapProps) {
  const area = useServiceArea();
  const [selected, setSelected] = useState<number | null>(null);
  const [visited, setVisited] = useState<Set<number>>(new Set());
  const [autoSearch, setAutoSearch] = useState(true);
  const [pendingBounds, setPendingBounds] = useState<MapBounds | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userMoved = useRef(false);
  const ready = useRef(false);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (area.isError) return <MapUnavailable message="The search area could not be loaded. Try reloading this page." />;
  if (!area.data) return <div className={styles.loading} role="status">Loading search area...</div>;
  const initialCenter = { lat: (area.data.north + area.data.south) / 2, lng: (area.data.east + area.data.west) / 2 };
  return <><Map mapId={mapId} defaultCenter={initialCenter} defaultZoom={9} gestureHandling="greedy" disableDefaultUI clickableIcons={false} onDragstart={() => { userMoved.current = true; }} onZoomChanged={() => { if (ready.current) userMoved.current = true; }} onClick={() => setSelected(null)} onIdle={(event) => {
    ready.current = true;
    if (!onBoundsChange || !userMoved.current) return;
    const current = event.map.getBounds()?.toJSON();
    if (!current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPendingBounds(current); if (autoSearch) onBoundsChange(current); }, 400);
  }}><MapRestriction bounds={area.data} /><InitialBounds listings={listings} bounds={bounds} />{listings.filter((listing) => listing.latitude !== null && listing.longitude !== null).map((listing) => <AdvancedMarker key={listing.id} position={{ lat: listing.latitude!, lng: listing.longitude! }} zIndex={selected === listing.id ? 1000 : hoveredListingId === listing.id ? 900 : 1}><div onMouseEnter={() => onHoverListing?.(listing.id)} onMouseLeave={() => onHoverListing?.(null)}><button className={`${styles.pin} ${visited.has(listing.id) ? styles.visited : ""} ${selected === listing.id || hoveredListingId === listing.id ? styles.selected : ""}`} aria-label={`${listing.title}, ${formatPrice(listing.price_per_night)} per night`} aria-pressed={selected === listing.id} onClick={() => { setSelected(listing.id); setVisited((current) => new Set(current).add(listing.id)); }}>{formatPrice(listing.price_per_night)}</button>{selected === listing.id && <div className={styles.preview}><ListingCard listing={listing} searchParams={searchParams} /><button className={styles.close} aria-label="Close listing preview" onClick={() => setSelected(null)}><X size={16} /></button></div>}</div></AdvancedMarker>)}</Map>{onBoundsChange && <div className={styles.controls}><label><input type="checkbox" checked={autoSearch} onChange={(event) => { setAutoSearch(event.target.checked); if (event.target.checked && pendingBounds) onBoundsChange(pendingBounds); }} />Search as I move the map</label>{!autoSearch && pendingBounds && <button onClick={() => { onBoundsChange(pendingBounds); setPendingBounds(null); }}>Search this area</button>}</div>}</>;
}
function InitialBounds({ listings, bounds }: Pick<ExploreMapProps, "listings" | "bounds">) {
  const map = useMap();
  const initialized = useRef(false);
  useEffect(() => {
    if (!map || initialized.current || !listings.length) return;
    const fit = new google.maps.LatLngBounds();
    if (bounds) { fit.extend({ lat: bounds.south, lng: bounds.west }); fit.extend({ lat: bounds.north, lng: bounds.east }); }
    else listings.forEach((listing) => { if (listing.latitude !== null && listing.longitude !== null) fit.extend({ lat: listing.latitude, lng: listing.longitude }); });
    if (!fit.isEmpty()) { map.fitBounds(fit, 60); initialized.current = true; }
  }, [map, listings, bounds]);
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


