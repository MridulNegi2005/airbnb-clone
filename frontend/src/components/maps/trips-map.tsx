"use client";

import { useEffect, useRef } from "react";
import { AdvancedMarker, Map, useMap } from "@vis.gl/react-google-maps";
import { AppImage } from "@/components/ui/app-image";
import type { Booking } from "@/types/api";
import { mapId, MapProvider, MapRestriction, MapUnavailable, useServiceArea } from "./google-maps";
import styles from "./trips-map.module.css";

export type TripsMapProps = { bookings: Booking[]; selectedId?: number | null; onSelect: (booking: Booking) => void };

export function TripsOverviewMap(props: TripsMapProps) {
  return <div className={styles.container}><MapProvider><TripMarkers {...props}/></MapProvider></div>;
}

function TripMarkers({ bookings, selectedId, onSelect }: TripsMapProps) {
  const area = useServiceArea();
  if (area.isError) return <MapUnavailable message="Your trip map could not load. You can still open each trip in the list."/>;
  if (!area.data) return <p className={styles.loading} role="status">Loading your trip map…</p>;
  const center = { lat: (area.data.south + area.data.north) / 2, lng: (area.data.west + area.data.east) / 2 };
  return <Map mapId={mapId} defaultCenter={center} defaultZoom={9} gestureHandling="greedy" disableDefaultUI clickableIcons={false}>
    <MapRestriction bounds={area.data}/>
    <FitTrips bookings={bookings}/>
    {bookings.map(booking => <AdvancedMarker key={booking.id} position={{lat: booking.listing.latitude, lng: booking.listing.longitude}} zIndex={selectedId===booking.id?10:1}>
      <button className={`${styles.marker} ${selectedId===booking.id?styles.selected:""}`} type="button" onClick={()=>onSelect(booking)} aria-label={`Open trip to ${booking.listing.city}, ${booking.check_in}`} aria-pressed={selectedId===booking.id}>
        <span className={styles.photo}>{booking.listing.cover_image_url?<AppImage src={booking.listing.cover_image_url} alt="" fill sizes="32px"/>:<span className={styles.initial}>{booking.listing.city[0]}</span>}</span>
        <span>{booking.listing.city}</span><span className={styles.year}>{booking.check_in.slice(0,4)}</span>
      </button>
    </AdvancedMarker>)}
  </Map>;
}

function FitTrips({bookings}:{bookings:Booking[]}) {
  const map=useMap();
  const fitted=useRef("");
  const key=bookings.map(booking=>`${booking.id}:${booking.listing.latitude}:${booking.listing.longitude}`).join("|");
  useEffect(()=>{
    if(!map||!bookings.length||fitted.current===key)return;
    const bounds=new google.maps.LatLngBounds();
    bookings.forEach(booking=>bounds.extend({lat:booking.listing.latitude,lng:booking.listing.longitude}));
    map.fitBounds(bounds,80);
    fitted.current=key;
  },[map,bookings,key]);
  return null;
}
