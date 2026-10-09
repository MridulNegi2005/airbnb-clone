import Link from "next/link";
import { Star } from "lucide-react";
import { AppImage } from "@/components/ui/app-image";
import type { ListingCard } from "@/types/api";
import styles from "./profiles.module.css";

export function ProfileListingCard({ listing }: { listing: ListingCard }) {
  const room = listing.room_type === "entire_home" ? "Entire place" : listing.room_type === "private_room" ? "Private room" : "Shared room";
  return <Link href={`/rooms/${listing.id}`} className={styles.profileListing}><span className={styles.profileListingPhoto}>{listing.image_urls[0] && <AppImage src={listing.image_urls[0]} alt={listing.title} fill sizes="185px" />}</span><strong>{room}</strong><span className={styles.profileListingTitle}>{listing.title}</span><span className={styles.profileListingRating}><Star size={10} fill="currentColor" />{listing.rating?.toFixed(2) ?? "New"}{listing.review_count > 0 && <> · {listing.review_count} reviews</>}</span></Link>;
}
