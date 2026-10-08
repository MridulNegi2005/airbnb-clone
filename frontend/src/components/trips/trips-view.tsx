"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { Modal } from "@/components/ui/modal";
import { BookingLocationMap, TripsMap } from "@/components/maps";
import { ComposeMessageModal } from "@/components/messages/compose-message-modal";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { cancelBooking, getBookings, queryKeys } from "@/lib/api";
import { toDateString } from "@/lib/dates";
import { formatDateRange,formatPrice } from "@/lib/format";
import type { Booking } from "@/types/api";
import { EmptyTrips, TripCard } from "./trip-card";
import { ReviewModal } from "./review-modal";
import styles from "./trips.module.css";

export function TripsSkeleton() {
  return <section className={styles.page} aria-label="Loading your trips" aria-busy="true">
    <div className={styles.sidebar}><h1>Trips</h1><div className={styles.tripList}>{[0, 1, 2].map(item => <div key={item} className={styles.loadingCard}><div className="skeleton" /><div><div className="skeleton" /><div className="skeleton" /></div></div>)}</div></div>
    <div className={styles.mapPane}><div className={`skeleton ${styles.loadingMap}`} /></div>
  </section>;
}

export function TripsView() {
  const { status, openAuth } = useAuth();
  const client = useQueryClient();
  const search = useSearchParams();
  const [showCancelled, setShowCancelled] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [cancel, setCancel] = useState<Booking | null>(null);
  const [review, setReview] = useState<Booking | null>(null);
  const [detail,setDetail]=useState<Booking|null>(null),[compose,setCompose]=useState<Booking|null>(null);const cooldown=useApiCooldown();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewSession, setReviewSession] = useState(0);
  const [cancelError, setCancelError] = useState("");
  const prompted = useRef(false);
  const highlight = Number(search.get("booking"));
  const today = toDateString(new Date());
  const query = useQuery({ queryKey: queryKeys.bookings, queryFn: ({ signal }) => getBookings(signal), enabled: status === "authenticated" });

  useEffect(() => {
    if (status === "anonymous" && !prompted.current) { prompted.current = true; openAuth(); }
  }, [status, openAuth]);

  const cancellation = useMutation({
    mutationFn: (booking: Booking) => cancelBooking(booking.id),
    onMutate: async booking => {
      setCancelError("");
      await client.cancelQueries({ queryKey: queryKeys.bookings });
      const previous = client.getQueryData<Booking[]>(queryKeys.bookings);
      client.setQueryData<Booking[]>(queryKeys.bookings, current => current?.map(trip => trip.id === booking.id ? { ...trip, status: "cancelled" } : trip));
      return { previous };
    },
    onError: (reason, _booking, context) => {
      cooldown.record(reason);
      if (context?.previous) client.setQueryData(queryKeys.bookings, context.previous);
      const message = reason instanceof Error ? reason.message : "Your trip could not be cancelled. Please try again.";
      setCancelError(message);
      toast.error(message);
    },
    onSuccess: () => { toast.success("Trip cancelled"); setCancelOpen(false); },
    onSettled: async (_result, _error, booking) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.bookings }),
        client.invalidateQueries({ queryKey: queryKeys.availability(booking.listing.id) }),
        client.invalidateQueries({ queryKey: ["quote", booking.listing.id] }),
        client.invalidateQueries({ queryKey: ["listings"] }),
        client.invalidateQueries({ queryKey: queryKeys.hostBookings }),
        client.invalidateQueries({ queryKey: queryKeys.hostListings }),
      ]);
    },
  });

  function openTrip(booking: Booking) {
    setSelectedId(booking.id);
    setDetail(booking);
    setDetailOpen(true);
  }
  function openCancellation(booking: Booking) {
    setDetailOpen(false);
    setCancelError("");
    setCancel(booking);
    setCancelOpen(true);
  }
  function openReview(booking: Booking) {
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
  return <section className={styles.page}>
    <div className={styles.sidebar}>
      <h1>Trips</h1>
      {query.isError ? <div className={styles.empty} role="alert"><h2>We couldn&apos;t load your trips</h2><p>{query.error.message}</p><button type="button" className="outline-button" onClick={() => { void query.refetch(); }} disabled={query.isFetching}>{query.isFetching ? "Trying again..." : "Try again"}</button></div>
        : <>
          <div id="trips-list" className={styles.tripList}>{visible.length ? visible.map(booking => <TripCard key={booking.id} booking={booking} selected={selectedId === booking.id} highlight={booking.id === highlight} today={today} onOpen={openTrip} />) : <EmptyTrips cancelled={showCancelled} />}</div>
          <button type="button" className={styles.cancelledToggle} aria-expanded={showCancelled} aria-controls="trips-list" onClick={() => setShowCancelled(value => !value)}>Cancelled reservations<ChevronDown size={16} aria-hidden="true" /></button>
          <p className={styles.help}>Can&apos;t find your reservation here? <Link href="/coming-soon">Visit the Help Centre</Link></p>
        </>}
    </div>
    <div className={styles.mapPane}><TripsMap bookings={visible} selectedId={selectedId} onSelect={openTrip} /></div>
    {cancel && <Modal open={cancelOpen} title="Cancel your trip?" onClose={() => { if (!cancellation.isPending) setCancelOpen(false); }} footer={<div className={styles.confirmActions}><button type="button" className="outline-button" disabled={cancellation.isPending} onClick={() => setCancelOpen(false)}>Keep trip</button><button type="button" className={styles.dangerButton} disabled={cancellation.isPending||cooldown.blocked} onClick={() => { if (cancelOpen && !cancellation.isPending && !cooldown.blocked) cancellation.mutate(cancel); }}>{cancellation.isPending ? "Cancelling..." : "Cancel trip"}</button></div>}>
      <div className={styles.cancelBody}><h3>{cancel.listing.title}</h3><p>{formatDateRange(cancel.check_in, cancel.check_out)}</p><p>This cannot be undone.</p>{cancelError && <p className="error-text" role="alert">{cancelError}</p>}</div>
    </Modal>}
    {detail&&<Modal open={detailOpen} title="Your reservation" width={760} onClose={()=>setDetailOpen(false)}><div className="trip-detail"><h2>{detail.listing.title}</h2><p>{formatDateRange(detail.check_in,detail.check_out)} · {detail.guests} guests</p><h3>Address</h3><p>{detail.listing.address}<br/>{detail.listing.neighbourhood}, {detail.listing.city}, {detail.listing.country}</p>{Number.isFinite(detail.listing.latitude)&&Number.isFinite(detail.listing.longitude)&&<BookingLocationMap latitude={detail.listing.latitude} longitude={detail.listing.longitude} label={detail.listing.title}/>}<h3>Price details</h3><dl><div><dt>{formatPrice(detail.nightly_rate)} × {detail.nights} nights</dt><dd>{formatPrice(detail.subtotal)}</dd></div>{detail.discount > 0 && <div className={styles.discount}><dt>Weekly stay discount</dt><dd>−{formatPrice(detail.discount)}</dd></div>}<div><dt>Cleaning fee</dt><dd>{formatPrice(detail.cleaning_fee)}</dd></div><div><dt>Airbnb service fee</dt><dd>{formatPrice(detail.service_fee)}</dd></div><div><dt><strong>Total before taxes</strong></dt><dd><strong>{formatPrice(detail.total)}</strong></dd></div></dl><div className={styles.detailActions}><Link className="outline-button" href={`/rooms/${detail.listing.id}`}>View listing</Link><button type="button" className="outline-button" onClick={()=>{setCompose(detail);setDetailOpen(false);}}>Message host</button>{detail.status === "confirmed" && detail.check_in > today && <button type="button" className="outline-button" onClick={() => openCancellation(detail)}>Cancel trip</button>}{detail.status === "confirmed" && detail.check_out <= today && (detail.has_review ? <span className={styles.reviewed}><Check size={16} aria-hidden="true" /> Reviewed</span> : <button type="button" className="dark-button" onClick={() => openReview(detail)}>Leave a review</button>)}</div></div></Modal>}
    {compose&&<ComposeMessageModal open onClose={()=>setCompose(null)} listingId={compose.listing.id} hostName={compose.listing.host.name}/>}
    {review && <ReviewModal key={reviewSession} open={reviewOpen} booking={review} onClose={() => setReviewOpen(false)} />}
  </section>;
}
