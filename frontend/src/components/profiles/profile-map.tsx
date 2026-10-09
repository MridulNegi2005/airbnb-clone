"use client";

import { useEffect, useRef } from "react";
import { AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps";
import { Maximize2, Minus, Plus, Scan } from "lucide-react";
import { mapId, MapProvider } from "@/components/maps/google-maps";
import { AppImage } from "@/components/ui/app-image";
import type { Booking } from "@/types/api";
import styles from "./profiles.module.css";

export function ProfileMap({ trips, selected, onSelect }: { trips: Booking[]; selected: number | null; onSelect: (id: number) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const first = trips[0];
  return <div className={styles.profileMap} ref={container}><MapProvider><Map mapId={mapId} defaultCenter={first ? { lat: first.listing.latitude, lng: first.listing.longitude } : { lat: 20, lng: 78 }} defaultZoom={5} gestureHandling="greedy" disableDefaultUI clickableIcons={false}><FitProfileTrips trips={trips} />{trips.map(trip => <AdvancedMarker key={trip.id} position={{ lat: trip.listing.latitude, lng: trip.listing.longitude }} zIndex={selected === trip.id ? 2 : 1}><button type="button" className={styles.profileMapMarker} aria-label={`Your trip to ${trip.listing.city}, ${trip.check_in.slice(0, 4)}`} aria-pressed={selected === trip.id} onClick={() => onSelect(trip.id)}><span className={styles.profileMapPhoto}>{trip.listing.cover_image_url ? <AppImage src={trip.listing.cover_image_url} alt="" fill sizes="24px" /> : trip.listing.city[0]}</span><span>{trip.listing.city}</span><span>{trip.check_in.slice(0, 4)}</span></button></AdvancedMarker>)}</Map><ProfileMapControls onExpand={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void container.current?.requestFullscreen().catch(() => {}); }} /></MapProvider></div>;
}

function FitProfileTrips({ trips }: { trips: Booking[] }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !trips.length) return;
    const bounds = new google.maps.LatLngBounds();
    trips.forEach(trip => bounds.extend({ lat: trip.listing.latitude, lng: trip.listing.longitude }));
    map.fitBounds(bounds, 80);
  }, [map, trips]);
  return null;
}

function ProfileMapControls({ onExpand }: { onExpand: () => void }) {
  const map = useMap();
  return <div className={styles.profileMapControls}><button type="button" aria-label="Show full-screen map" onClick={onExpand}><Maximize2 size={20} /></button><div><button type="button" aria-label="Zoom in" onClick={() => map?.setZoom((map.getZoom() ?? 5) + 1)}><Plus size={24} /></button><button type="button" aria-label="Zoom out" onClick={() => map?.setZoom(Math.max(2, (map.getZoom() ?? 5) - 1))}><Minus size={24} /></button></div><button type="button" aria-label="Zoom to world view" onClick={() => map?.moveCamera({ center: { lat: 20, lng: 78 }, zoom: 2 })}><Scan size={20} /></button></div>;
}
