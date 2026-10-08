"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, ChevronRight } from "lucide-react";
import { AppImage } from "@/components/ui/app-image";
import { getHostListings, queryKeys } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import styles from "./host-calendar.module.css";
export function CalendarListings() {
  const { status, user, openAuth } = useAuth();
  const listings = useQuery({ queryKey: [...queryKeys.hostListings, user?.id], queryFn: ({ signal }) => getHostListings(signal), enabled: status === "authenticated" });
  return <div className={styles.selector}><h1>Calendar</h1><p className="muted">Choose a listing to manage its availability.</p>{status === "loading" || (status === "authenticated" && listings.isPending) ? <div aria-busy="true" aria-label="Loading your listings" className={styles.selectorList}>{[0,1,2].map(index => <div key={index} className={`${styles.selectorSkeleton} skeleton`} />)}</div> : status === "anonymous" ? <div className={styles.gate}><CalendarDays size={48} aria-hidden="true" /><h2>Log in to manage your calendars</h2><button className="dark-button" onClick={() => openAuth()}>Log in</button></div> : listings.isError ? <div className={styles.gate}><p role="alert">{listings.error.message}</p><button className="outline-button" onClick={() => void listings.refetch()}>Try again</button></div> : !listings.data?.length ? <div className={styles.gate}><CalendarDays size={48} aria-hidden="true" /><h2>Your calendars will appear here</h2><p>Create your first listing to start welcoming guests.</p><Link className="dark-button" href="/hosting/listings/new">Create listing</Link></div> : <div className={styles.selectorList}>{listings.data.map(listing => <Link key={listing.id} href={`/hosting/listings/${listing.id}/calendar`} className={styles.selectorItem}>{listing.image_urls[0] ? <AppImage src={listing.image_urls[0]} width={80} height={72} alt="" /> : <CalendarDays size={32} aria-hidden="true" />}<span><strong>{listing.title}</strong><small>{listing.neighbourhood}, {listing.city}</small></span><ChevronRight size={20} aria-hidden="true" /></Link>)}</div>}</div>;
}
