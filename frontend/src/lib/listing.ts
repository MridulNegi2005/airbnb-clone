import type { ListingCard } from "@/types/api";
export function isGuestFavourite(listing: ListingCard): boolean { return (listing.rating ?? 0) >= 4.9 && listing.review_count >= 5; }
