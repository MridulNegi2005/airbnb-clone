"use client";

import dynamic from "next/dynamic";
import type { ExploreMapProps, HostAddressPickerProps, LocationMapProps } from "./types";
import styles from "./maps.module.css";

function LoadingMap() { return <div className={styles.loading} role="status">Loading map...</div>; }
const PriceMap = dynamic(() => import("./google-maps").then((module) => module.PriceMap), { ssr: false, loading: LoadingMap });
const LocationMap = dynamic(() => import("./google-maps").then((module) => module.LocationMap), { ssr: false, loading: LoadingMap });
const AddressPicker = dynamic(() => import("./host-address-picker").then((module) => module.AddressPicker), { ssr: false, loading: LoadingMap });

export function ExploreMap(props: ExploreMapProps) { return <PriceMap {...props} />; }
export function WishlistMap({ listings }: Pick<ExploreMapProps, "listings">) { return <PriceMap listings={listings} />; }
export function ListingLocationMap(props: LocationMapProps) { return <LocationMap {...props} approximate />; }
export function BookingLocationMap(props: LocationMapProps) { return <LocationMap {...props} />; }
export function HostAddressPicker(props: HostAddressPickerProps) { return <AddressPicker {...props} />; }
export type { HostAddressValue } from "./types";
