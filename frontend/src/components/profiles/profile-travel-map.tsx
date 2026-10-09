"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { AppImage } from "@/components/ui/app-image";
import type { Booking, PublicProfile } from "@/types/api";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileMap } from "./profile-map";
import styles from "./profiles.module.css";

export function ProfileTravelMap({ trips, person, loading, error, retry }: { trips: Booking[]; person: PublicProfile; loading: boolean; error?: string; retry: () => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const sorted = [...trips].sort((a, b) => b.check_in.localeCompare(a.check_in));
  const startsYear = (index: number) => sorted[index]?.check_in.slice(0, 4) !== sorted[index - 1]?.check_in.slice(0, 4);
  function dates(trip: Booking) {
    const formatter = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });
    return formatter.formatRange(new Date(trip.check_in), new Date(trip.check_out));
  }
  return <div className={styles.travelMapLayout}><section className={styles.travelTimeline}><header><h1>Travel map</h1><p>{trips.length} {trips.length === 1 ? "trip" : "trips"} by you</p></header><div className={styles.travelMapNotice}><AppImage src="https://a0.muscache.com/im/pictures/airbnb-platform-assets/AirbnbPlatformAssets-UserProfile/original/ed28537a-fc3c-4253-bb89-a6d927df7e50.png?im_w=120" width={56} height={56} alt="" /><p>When someone accepts your invite, you&apos;ll see their trips on the map.</p></div>{loading ? <div aria-busy="true" aria-label="Loading trips">{[0, 1, 2].map(item => <div key={item} className={`skeleton ${styles.travelTripSkeleton}`} />)}</div> : error ? <div role="alert"><p className="error-text">{error}</p><button type="button" className="text-button" onClick={retry}>Try again</button></div> : sorted.length ? sorted.map((trip, index) => <Fragment key={trip.id}>{startsYear(index) && <h2 className={styles.travelYear}>{trip.check_in.slice(0, 4)}</h2>}<Link href={`/trips/v1/${trip.id}`} className={styles.travelTrip} data-selected={selected === trip.id} onMouseEnter={() => setSelected(trip.id)} onMouseLeave={() => setSelected(null)} onFocus={() => setSelected(trip.id)} onBlur={() => setSelected(null)}><span className={styles.travelTripPhoto}>{trip.listing.cover_image_url && <AppImage src={trip.listing.cover_image_url} alt="" fill sizes="96px" />}</span><span className={styles.travelTripDetails}><strong>Your trip to {trip.listing.city}</strong><span>{dates(trip)}</span><ProfileAvatar user={person} size={24} verified={false} /></span></Link></Fragment>) : <p className={styles.travelEmpty}>Your past trips will appear here.</p>}</section><div className={styles.travelMapCanvas}><ProfileMap trips={trips} selected={selected} onSelect={setSelected} /></div></div>;
}
