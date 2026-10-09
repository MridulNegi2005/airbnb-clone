"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Heart, ImageOff, Star } from "lucide-react";
import { AppImage } from "@/components/ui/app-image";
import { useWishlist } from "@/hooks/use-wishlist";
import { getListing, queryKeys } from "@/lib/api";
import { formatPrice, formatRating, plural } from "@/lib/format";
import { isGuestFavourite } from "@/lib/listing";
import type { ListingCard } from "@/types/api";
import styles from "./wishlists.module.css";

export function WishlistListingCard({ listing, searchParams, priority }: { listing: ListingCard; searchParams: string; priority: boolean }) {
  const { savedIds, toggle, isBlocked } = useWishlist();
  const details = useQuery({ queryKey: queryKeys.listing(listing.id), queryFn: ({ signal }) => getListing(listing.id, signal) });
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const active = Math.min(index, Math.max(0, listing.image_urls.length - 1));
  const href = `/rooms/${listing.id}?${searchParams}`;
  const title = `${listing.room_type === "private_room" ? "Room" : listing.room_type === "shared_room" ? "Shared room" : { apartment: "Flat", house: "Home", guesthouse: "Guesthouse", hotel: "Hotel" }[listing.property_type]} in ${listing.city}`;
  const saved = savedIds.has(listing.id);
  function move(next: number) {
    setIndex(next);
    track.current?.scrollTo({ left: next * track.current.clientWidth, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }
  return <article className={styles.savedCard}>
    <div className={styles.savedPhoto}>
      <Link href={href} aria-label={`View ${listing.title}`} className={styles.photoLink}>
        <div ref={track} className={styles.photoTrack} onScroll={event => { const element = event.currentTarget; if (element.clientWidth) setIndex(Math.round(element.scrollLeft / element.clientWidth)); }}>
          {listing.image_urls.length ? listing.image_urls.map((image, photo) => <div key={`${image}-${photo}`} className={styles.photoSlide}>{Math.abs(photo - active) <= 1 && <AppImage src={image} alt={`${listing.title}, photo ${photo + 1}`} fill sizes="(max-width:743px) calc(100vw - 48px), (max-width:1127px) calc((100vw - 72px)/2), calc((63vw - 96px)/3)" priority={priority && photo === 0} />}</div>) : <span className={styles.photoFallback}><ImageOff size={32} />No photo available</span>}
        </div>
      </Link>
      {isGuestFavourite(listing) && <span className={styles.favourite}>Guest favourite</span>}
      <button type="button" className={styles.savedHeart} aria-label={saved ? `Remove from wishlist: ${title}` : `Add to wishlist: ${title}`} aria-pressed={saved} disabled={isBlocked} onClick={() => toggle(listing.id)}><Heart size={24} fill={saved ? "var(--brand)" : "rgba(0,0,0,.5)"} stroke="white" strokeWidth={2} /></button>
      {active > 0 && <button type="button" className={`${styles.photoArrow} ${styles.previousPhoto}`} aria-label={`Previous photo: ${title}`} onClick={() => move(active - 1)}><ChevronLeft size={16} /></button>}
      {active < listing.image_urls.length - 1 && <button type="button" className={`${styles.photoArrow} ${styles.nextPhoto}`} aria-label={`Next photo: ${title}`} onClick={() => move(active + 1)}><ChevronRight size={16} /></button>}
      {listing.image_urls.length > 1 && <div className={styles.photoDots} aria-hidden="true">{listing.image_urls.slice(Math.max(0, active - 2), Math.max(0, active - 2) + 5).map((_, dot) => <span key={dot} data-active={dot + Math.max(0, active - 2) === active} />)}</div>}
    </div>
    <Link href={href} className={styles.savedCopy}><div className={styles.savedTitle}><h3>{title}</h3><span><Star size={12} fill="currentColor" />{formatRating(listing.rating)}</span></div><p>{listing.title}</p><p>{details.data ? `${plural(details.data.beds, "bed")} · ${plural(details.data.bedrooms, "bedroom")}` : "\u00a0"}</p>{new URLSearchParams(searchParams).has("checkin") && <p><strong>{formatPrice(listing.price_per_night)}</strong> night</p>}</Link>
    <div className={styles.noteBar}><button className={styles.noteButton} type="button" disabled title="Wishlist notes are coming soon">Add note</button><div className={styles.reactions}><button type="button" disabled aria-label={`Like ${listing.title}`} title="Wishlist reactions are coming soon">👍</button><button type="button" disabled aria-label={`Dislike ${listing.title}`} title="Wishlist reactions are coming soon">👎</button></div></div>
  </article>;
}
