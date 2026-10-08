"use client";

import { useQuery } from "@tanstack/react-query";
import { Heart, Share2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { DatePicker } from "@/components/calendar/date-picker";
import { useAvailability } from "@/hooks/use-availability";
import { useWishlist } from "@/hooks/use-wishlist";
import { getQuote, queryKeys } from "@/lib/api";
import { countNights, parseDate, toDateString, validateStay } from "@/lib/dates";
import { formatDateRange } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import type { ListingDetail, ReviewPage } from "@/types/api";
import { ListingInformation, LocationAndHost } from "./listing-information";
import { PhotoGallery } from "./photo-gallery";
import { ReviewsSection } from "./reviews-section";
import { StaySelector, type GuestSelection, type StayRange } from "./stay-selector";
import styles from "./detail.module.css";

function guestValue(value: string | null, minimum: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : minimum;
}

export function ListingDetailView({ listing, initialReviews }: { listing: ListingDetail; initialReviews: ReviewPage }) {
  const router = useRouter();
  const search = useSearchParams();
  const auth = useAuth();
  const wishlist = useWishlist();
  const availability = useAvailability(listing.id);
  const [reserving, setReserving] = useState(false);
  const checkIn = search.get("checkin") ?? "";
  const checkOut = search.get("checkout") ?? "";
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(checkIn) && toDateString(parseDate(checkIn)) === checkIn && checkIn >= toDateString(new Date());
  const validEnd = validStart && checkOut && !validateStay(checkIn, checkOut);
  const range: StayRange | undefined = validStart ? { from: parseDate(checkIn), to: validEnd ? parseDate(checkOut) : undefined } : undefined;
  const adults = guestValue(search.get("adults"), 1, listing.max_guests);
  const guests: GuestSelection = { adults, children: guestValue(search.get("children"), 0, listing.max_guests - adults), infants: guestValue(search.get("infants"), 0, 5), pets: guestValue(search.get("pets"), 0, 5) };
  const stay = { check_in: validStart ? checkIn : "", check_out: validEnd ? checkOut : "", guests: guests.adults + guests.children };
  const selectedNights = stay.check_in && stay.check_out ? countNights(stay.check_in, stay.check_out) : 0;
  const durationError = selectedNights > 0 ? selectedNights < listing.min_nights ? `Minimum stay: ${listing.min_nights} nights` : selectedNights > listing.max_nights ? `Maximum stay: ${listing.max_nights} nights` : null : null;
  const stayError = durationError ?? (stay.check_in && stay.check_out ? validateStay(stay.check_in, stay.check_out, availability.data ?? []) : null);
  const quote = useQuery({ queryKey: queryKeys.quote(listing.id, stay), queryFn: ({ signal }) => getQuote(listing.id, stay, signal), enabled: Boolean(stay.check_in && stay.check_out && availability.isSuccess && !stayError) });

  function updateSearch(values: Record<string, string | undefined>) {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(values)) { if (value) next.set(key, value); else next.delete(key); }
    window.history.replaceState(null, "", `/rooms/${listing.id}${next.size ? `?${next}` : ""}`);
  }

  function changeRange(next: StayRange | undefined) {
    updateSearch({ checkin: next?.from ? toDateString(next.from) : undefined, checkout: next?.to ? toDateString(next.to) : undefined });
  }

  function changeGuests(next: GuestSelection) {
    updateSearch({ adults: String(next.adults), children: String(next.children), infants: String(next.infants), pets: String(next.pets) });
  }

  async function share() {
    try {
      if (window.matchMedia("(max-width: 949px)").matches && navigator.share) await navigator.share({ title: listing.title, url: window.location.href });
      else { await navigator.clipboard.writeText(window.location.href); toast.success("Link copied"); }
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) toast.error("Could not share the link. Copy the address from your browser."); }
  }

  async function reserve() {
    if (reserving) return;
    setReserving(true);
    try {
      const latest = await availability.refetch();
      if (!latest.data || latest.isError) { toast.error("We could not load availability. Please try again."); return; }
      const error = durationError ?? validateStay(stay.check_in, stay.check_out, latest.data);
      if (error) { toast.error(error); changeRange(undefined); return; }
      const latestQuote = await quote.refetch();
      if (!latestQuote.data || latestQuote.isError) { toast.error(latestQuote.error?.message ?? "Could not verify your price. Please try again."); return; }
      if (!latestQuote.data.available) { toast.error("Those dates are no longer available"); changeRange(undefined); return; }
      const bookingQuery = new URLSearchParams({ checkin: stay.check_in, checkout: stay.check_out, adults: String(guests.adults), children: String(guests.children), infants: String(guests.infants), pets: String(guests.pets) });
      const continueBooking = () => router.push(`/book/${listing.id}?${bookingQuery}`);
      if (!auth.user) auth.openAuth(continueBooking); else continueBooking();
    } finally { setReserving(false); }
  }

  const title = range?.from && range.to ? `${countNights(toDateString(range.from), toDateString(range.to))} nights in ${listing.city}` : range?.from ? "Select checkout date" : "Select check-in date";
  return <div className={styles.page}>
    <div className={styles.titleRow}><h1>{listing.title}</h1><div><button onClick={() => void share()}><Share2 size={16} aria-hidden="true" />Share</button><button disabled={wishlist.isBlocked} onClick={() => wishlist.toggle(listing.id)} aria-pressed={wishlist.savedIds.has(listing.id)}><Heart size={16} fill={wishlist.savedIds.has(listing.id) ? "var(--brand)" : "none"} aria-hidden="true" />{wishlist.savedIds.has(listing.id) ? "Saved" : "Save"}</button></div></div>
    <PhotoGallery title={listing.title} images={listing.image_urls} saved={wishlist.savedIds.has(listing.id)} onShare={() => void share()} onSave={() => wishlist.toggle(listing.id)} saveDisabled={wishlist.isBlocked} />
    <div className={styles.bodyGrid}><div className={styles.leftColumn}><ListingInformation listing={listing} /><section className={styles.section} id="availability"><h2>{title}</h2><p className={styles.secondary}>{range?.from && range.to ? formatDateRange(range.from, range.to) : "Add your travel dates for exact pricing"}</p>{availability.isPending ? <div className={`${styles.skeleton} ${styles.calendarSkeleton}`} /> : availability.isError ? <p className={styles.inlineError} role="alert">We could not load availability. <button onClick={() => void availability.refetch()}>Try again</button></p> : <><div className={styles.desktopCalendar}><DatePicker minNights={listing.min_nights} maxNights={listing.max_nights} value={range} onChange={changeRange} bookedRanges={availability.data} numberOfMonths={2} /></div><div className={styles.singleCalendar}><DatePicker minNights={listing.min_nights} maxNights={listing.max_nights} value={range} onChange={changeRange} bookedRanges={availability.data} numberOfMonths={1} /></div><p className={styles.minimumStay}>Minimum stay: {listing.min_nights} {listing.min_nights === 1 ? "night" : "nights"}</p><div className={styles.calendarFooter}><button className={styles.textButton} onClick={() => changeRange(undefined)}>Clear dates</button></div></>}</section></div>
      <StaySelector listing={listing} range={range} onRangeChange={changeRange} guests={guests} onGuestsChange={changeGuests} bookedRanges={availability.data ?? []} quote={quote.data} availabilityLoading={availability.isPending} availabilityError={availability.isError} quoteLoading={quote.isFetching} quoteError={stayError ?? (quote.isError ? quote.error.message : null)} onRetry={() => void availability.refetch()} onReserve={() => void reserve()} reserving={reserving || auth.status === "loading"} />
    </div>
    <ReviewsSection listingId={listing.id} initialReviews={initialReviews} />
    <LocationAndHost listing={listing} />
  </div>;
}
