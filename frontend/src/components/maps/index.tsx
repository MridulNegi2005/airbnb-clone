"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ExploreMapProps, HostAddressPickerProps, LocationMapProps } from "./types";
import styles from "./maps.module.css";
import type { TripsMapProps } from "./trips-map";

function LoadingMap() { return <div className={styles.loading} role="status">Loading map...</div>; }
const PriceMap = dynamic(() => import("./google-maps").then((module) => module.PriceMap), { ssr: false, loading: LoadingMap });
const LocationMap = dynamic(() => import("./google-maps").then((module) => module.LocationMap), { ssr: false, loading: LoadingMap });
const AddressPicker = dynamic(() => import("./host-address-picker").then((module) => module.AddressPicker), { ssr: false, loading: LoadingMap });
const TripsOverviewMap = dynamic(() => import("./trips-map").then((module) => module.TripsOverviewMap), { ssr: false, loading: LoadingMap });

export function ExploreMap(props: ExploreMapProps) { return <PriceMap {...props} />; }
export function WishlistMap({ listings }: Pick<ExploreMapProps, "listings">) { return <PriceMap listings={listings} />; }
// The listing map sits far below the fold: load Google Maps only when the reader scrolls near it.
function WhenNearViewport({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || near) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) setNear(true); }, { rootMargin: "600px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near]);
  return <div ref={ref} style={{ width: "100%", height: "100%" }}>{near ? children : <LoadingMap />}</div>;
}

export function ListingLocationMap(props: LocationMapProps) { return <WhenNearViewport><LocationMap {...props} approximate /></WhenNearViewport>; }
export function BookingLocationMap(props: LocationMapProps) { return <LocationMap {...props} />; }
export function HostAddressPicker(props: HostAddressPickerProps) { return <AddressPicker {...props} />; }
export function TripsMap(props: TripsMapProps) { return <TripsOverviewMap {...props} />; }
export type { HostAddressValue } from "./types";
