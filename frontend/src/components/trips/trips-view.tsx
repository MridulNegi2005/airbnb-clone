"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { Modal } from "@/components/ui/modal";
import { BookingLocationMap, TripsMap } from "@/components/maps";
import { ComposeMessageModal } from "@/components/messages/compose-message-modal";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { cancelBooking, getBookings, queryKeys } from "@/lib/api";
import { toDateString } from "@/lib/dates";
import { formatDateRange,formatPrice,plural } from "@/lib/format";
import type { Booking } from "@/types/api";
import { EmptyTrips, TripCard } from "./trip-card";
import { TripsPanel } from "./trips-panel";
import { TripDetailPanel } from "./trip-detail-panel";
import { ReviewModal } from "./review-modal";
import styles from "./trips.module.css";

export function TripsSkeleton() {
  return <section className={styles.page} aria-label="Loading your trips" aria-busy="true">
    <div className={styles.sidebar}><h1>Trips</h1><div className={styles.tripList}>{[0, 1, 2].map(item => <div key={item} className={styles.loadingCard}><div className="skeleton" /><div><div className="skeleton" /><div className="skeleton" /></div></div>)}</div></div>
    <div className={styles.mapPane}><div className={`skeleton ${styles.loadingMap}`} /></div>
  </section>;
}

export function TripsView() {
  const { user, status, openAuth } = useAuth();
  const client = useQueryClient();
  const search = useSearchParams();
  const router = useRouter();
  const sidebar = useRef<HTMLDivElement>(null);
  const lastOpened = useRef<number | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const [cancel, setCancel] = useState<Booking | null>(null);
  const [review, setReview] = useState<Booking | null>(null);
  const detailId = Number(search.get("trip")) || null;
  const [compose, setCompose] = useState<Booking | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSession, setComposeSession] = useState(0);
  const cooldown = useApiCooldown();
  const reviewCooldown = useApiCooldown();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSession, setReviewSession] = useState(0);
  const [cancelError, setCancelError] = useState("");
  const prompted = useRef(false);
  const cancellationPending = useRef(false);
  const bookingHighlight = Number(search.get("booking"));
  const [expiredHighlight, setExpiredHighlight] = useState<number | null>(null);
  const highlight = bookingHighlight === expiredHighlight ? 0 : bookingHighlight;
  const today = toDateString(new Date());
  const query = useQuery({ queryKey: queryKeys.bookings, queryFn: ({ signal }) => getBookings(signal), enabled: status === "authenticated" });
  const detail = query.data?.find(booking => booking.id === detailId);
  const highlightedTripLoaded = query.isSuccess && Boolean(query.data?.some(booking => booking.id === bookingHighlight));

  useEffect(() => {
    if (!highlightedTripLoaded || expiredHighlight === bookingHighlight) return;
    const timer = window.setTimeout(() => setExpiredHighlight(bookingHighlight), 3000);
    return () => window.clearTimeout(timer);
  }, [bookingHighlight, expiredHighlight, highlightedTripLoaded]);

  useEffect(() => {
    if (status === "anonymous" && !prompted.current) { prompted.current = true; openAuth(); }
  }, [status, openAuth]);

  useEffect(() => {
    if (!query.isSuccess) return;
    if (detailId) sidebar.current?.querySelector<HTMLHeadingElement>("h1")?.focus({ preventScroll: true });
    else if (lastOpened.current) sidebar.current?.querySelector<HTMLButtonElement>(`#trip-${lastOpened.current} button`)?.focus({ preventScroll: true });
  }, [detailId, query.isSuccess]);

  const cancellation = useMutation({
    retry: false,
    mutationFn: (booking: Booking) => cancelBooking(booking.id),
    onMutate: async booking => {
      setCancelError("");
      await client.cancelQueries({ queryKey: queryKeys.bookings });
      const previousStatus = client.getQueryData<Booking[]>(queryKeys.bookings)?.find(trip => trip.id === booking.id)?.status;
      client.setQueryData<Booking[]>(queryKeys.bookings, current => current?.map(trip => trip.id === booking.id ? { ...trip, status: "cancelled" } : trip));
      return { previousStatus };
    },
    onError: (reason, booking, context) => {
      cooldown.record(reason);
      const previousStatus = context?.previousStatus;
      if (previousStatus) client.setQueryData<Booking[]>(queryKeys.bookings, current => current?.map(trip => trip.id === booking.id ? { ...trip, status: previousStatus } : trip));
      const message = reason instanceof Error ? reason.message : "Your trip could not be cancelled. Please try again.";
      setCancelError(message);
      toast.error(message);
    },
    onSuccess: result => {
      client.setQueryData<Booking[]>(queryKeys.bookings, current => current?.map(trip => trip.id === result.id ? result : trip));
      toast.success("Trip cancelled");
      setCancelOpen(false);
    },
    onSettled: async (_result, _error, booking) => {
      try { await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.bookings }),
        client.invalidateQueries({ queryKey: queryKeys.availability(booking.listing.id) }),
        client.invalidateQueries({ queryKey: ["quote", booking.listing.id] }),
        client.invalidateQueries({ queryKey: ["listings"] }),
        client.invalidateQueries({ queryKey: queryKeys.hostBookings }),
        client.invalidateQueries({ queryKey: queryKeys.hostListings }),
      ]); } finally { cancellationPending.current = false; }
    },
  });

  function openTrip(booking: Booking) {
    lastOpened.current = booking.id;
    setDetailOpen(false);
    const next = new URLSearchParams(search);
    next.set("trip", String(booking.id));
    router.push(`/trips?${next}`, { scroll: false });
  }
  function closeTrip() {
    const next = new URLSearchParams(search);
    next.delete("trip");
    router.replace(`/trips${next.size ? `?${next}` : ""}`, { scroll: false });
  }
  async function shareListing(booking: Booking) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/rooms/${booking.listing.id}`);
      toast.success("Link copied");
    } catch { toast.error("We could not copy the link. Please try again."); }
  }
  function openCancellation(booking: Booking) {
    if (cancellationPending.current || booking.status !== "confirmed" || booking.check_in <= today) return;
    setDetailOpen(false);
    setCancelError("");
    setCancel(booking);
    setCancelOpen(true);
  }
  function openReview(booking: Booking) {
    if (reviewCooldown.blocked || booking.status !== "confirmed" || booking.check_out > today || booking.has_review) return;
    setDetailOpen(false);
    setReview(booking);
    setReviewSession(session => session + 1);
    setReviewOpen(true);
  }
  if (status === "loading" || (status === "authenticated" && query.isPending)) return <TripsSkeleton />;
  if (status === "anonymous") return <section className={styles.page}><div className={styles.sidebar}><h1>Trips</h1><div className={styles.empty}><h2>Log in to see your trips</h2><p>Keep your upcoming adventures and past stays in one place.</p><button type="button" className="dark-button" onClick={() => openAuth()}>Log in</button></div></div></section>;

  const confirmed = (query.data ?? []).filter(booking => booking.status === "confirmed");
  const cancelled = (query.data ?? []).filter(booking => booking.status === "cancelled");
  const visible = showCancelled ? cancelled : confirmed;
  const mappedTrips = detail && !visible.some(trip => trip.id === detail.id) ? [...visible, detail] : visible;
  return <section className={styles.page}>
    <TripsPanel panelRef={sidebar}>
      {detail ? <TripDetailPanel booking={detail} onBack={closeTrip} onReservation={() => setDetailOpen(true)} onShare={() => { void shareListing(detail); }} /> : <>
      <h1 tabIndex={-1}>Trips</h1>
      {query.isError ? <div className={styles.empty} role="alert"><h2>We couldn&apos;t load your trips</h2><p>{query.error.message}</p><button type="button" className="outline-button" onClick={() => { void query.refetch(); }} disabled={query.isFetching}>{query.isFetching ? "Trying again..." : "Try again"}</button></div>
        : <>
          <div id="trips-list" className={styles.tripList}>{visible.length ? visible.map(booking => <TripCard key={booking.id} booking={booking} guest={user} selected={detailId === booking.id} highlight={booking.id === highlight} today={today} onOpen={openTrip} />) : <EmptyTrips cancelled={showCancelled} />}</div>
          <button type="button" className={styles.cancelledToggle} aria-expanded={showCancelled} aria-controls="trips-list" onClick={() => setShowCancelled(value => !value)}>Cancelled reservations<ChevronDown size={16} aria-hidden="true" /></button>
          <p className={styles.help}>Can&apos;t find your reservation here? <Link href="/coming-soon">Visit the Help Centre</Link></p>
        </>}
      </>}
    </TripsPanel>
    <div className={styles.mapPane}><TripsMap bookings={mappedTrips} selectedId={detailId} onSelect={openTrip} /></div>
    {cancel && <Modal open={cancelOpen} title="Cancel your trip?" onClose={() => { if (!cancellationPending.current) setCancelOpen(false); }} footer={<div className={styles.confirmActions}><button type="button" className="outline-button" disabled={cancellation.isPending} onClick={() => { if (!cancellationPending.current) setCancelOpen(false); }}>Keep trip</button><button type="button" className={styles.dangerButton} disabled={cancellation.isPending||cooldown.blocked} onClick={() => { if (cancelOpen && !cancellationPending.current && !cooldown.blocked && cancel.status === "confirmed" && cancel.check_in > today) { cancellationPending.current = true; cancellation.mutate(cancel); } }}>{cancellation.isPending ? "Cancelling..." : "Cancel trip"}</button></div>}>
      <div className={styles.cancelBody}><h3>{cancel.listing.title}</h3><p>{formatDateRange(cancel.check_in, cancel.check_out)}</p><p>This cannot be undone.</p>{cancelError && <p className="error-text" role="alert">{cancelError}</p>}</div>
    </Modal>}
    {detail&&<Modal open={detailOpen} title="Your reservation" width={760} onClose={()=>setDetailOpen(false)}><div className="trip-detail"><h2>{detail.listing.title}</h2><p>{formatDateRange(detail.check_in,detail.check_out)} · {plural(detail.guests, "guest")}</p><h3>Address</h3><p>{detail.listing.address}<br/>{detail.listing.neighbourhood}, {detail.listing.city}, {detail.listing.country}</p>{Number.isFinite(detail.listing.latitude)&&Number.isFinite(detail.listing.longitude)&&<BookingLocationMap latitude={detail.listing.latitude} longitude={detail.listing.longitude} label={detail.listing.title}/>}<h3>Price details</h3><dl><div><dt>{formatPrice(detail.nightly_rate)} × {plural(detail.nights, "night")}</dt><dd>{formatPrice(detail.subtotal)}</dd></div>{detail.discount > 0 && <div className={styles.discount}><dt>Weekly stay discount</dt><dd>−{formatPrice(detail.discount)}</dd></div>}<div><dt>Cleaning fee</dt><dd>{formatPrice(detail.cleaning_fee)}</dd></div><div><dt>Airbnb service fee</dt><dd>{formatPrice(detail.service_fee)}</dd></div><div><dt><strong>Total before taxes</strong></dt><dd><strong>{formatPrice(detail.total)}</strong></dd></div></dl><div className={styles.detailActions}><Link className="outline-button" href={`/rooms/${detail.listing.id}`}>View listing</Link><button type="button" className="outline-button" onClick={()=>{setCompose(detail);setComposeSession(value=>value+1);setComposeOpen(true);setDetailOpen(false);}}>Message host</button>{detail.status === "confirmed" && detail.check_in > today && <button type="button" className="outline-button" disabled={cancellation.isPending || cooldown.blocked} onClick={() => openCancellation(detail)}>Cancel trip</button>}{detail.status === "confirmed" && detail.check_out <= today && (detail.has_review ? <span className={styles.reviewed}><Check size={16} aria-hidden="true" /> Reviewed</span> : <button type="button" className="dark-button" disabled={reviewCooldown.blocked} onClick={() => openReview(detail)}>Leave a review</button>)}</div></div></Modal>}
    {compose&&<ComposeMessageModal key={`compose-${composeSession}`} open={composeOpen} onClose={()=>setComposeOpen(false)} listingId={compose.listing.id} hostName={compose.listing.host.name}/>}
    {review && <ReviewModal key={reviewSession} open={reviewOpen} booking={review} cooldown={reviewCooldown} onClose={() => setReviewOpen(false)} />}
  </section>;
}
