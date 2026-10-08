"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { Modal } from "@/components/ui/modal";
import { BookingLocationMap } from "@/components/maps";
import { ComposeMessageModal } from "@/components/messages/compose-message-modal";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { cancelBooking, getBookings, queryKeys } from "@/lib/api";
import { toDateString } from "@/lib/dates";
import { formatDateRange,formatPrice } from "@/lib/format";
import type { Booking } from "@/types/api";
import { EmptyTrips, TripCard } from "./trip-card";
import { ReviewModal } from "./review-modal";
import styles from "./trips.module.css";

type Tab = "upcoming" | "past" | "cancelled";
const tabs: { id: Tab; label: string }[] = [{ id: "upcoming", label: "Upcoming" }, { id: "past", label: "Past" }, { id: "cancelled", label: "Cancelled" }];

export function TripsSkeleton() {
  return <section className={`content-shell ${styles.page}`} aria-label="Loading your trips" aria-busy="true"><h1>Trips</h1><div className={styles.loadingTabs}><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div><div className={styles.loadingCard}><div><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div><div className="skeleton" /></div></section>;
}

export function TripsView() {
  const { status, openAuth } = useAuth();
  const client = useQueryClient();
  const search = useSearchParams();
  const [tab, setTab] = useState<Tab>("upcoming");
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

  function tabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") target = (index + tabs.length - 1) % tabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = tabs.length - 1;
    else return;
    event.preventDefault();
    const next = tabs[target];
    if (next) { setTab(next.id); document.getElementById(`trips-tab-${next.id}`)?.focus(); }
  }
  if (status === "loading" || (status === "authenticated" && query.isPending)) return <TripsSkeleton />;
  if (status === "anonymous") return <section className={`content-shell ${styles.page}`}><h1>Trips</h1><div className={styles.empty}><h2>Log in to see your trips</h2><p>Keep your upcoming adventures and past stays in one place.</p><button type="button" className="dark-button" onClick={() => openAuth()}>Log in</button></div></section>;

  const trips = (query.data ?? []).filter(booking => tab === "cancelled" ? booking.status === "cancelled" : booking.status === "confirmed" && (tab === "upcoming" ? booking.check_out > today : booking.check_out <= today));
  return <section className={`content-shell ${styles.page}`}>
    <h1>Trips</h1>
    <div className={styles.tabs} role="tablist" aria-label="Your trips">{tabs.map((item, index) => <button key={item.id} id={`trips-tab-${item.id}`} role="tab" type="button" aria-selected={tab === item.id} aria-controls="trips-panel" tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => tabKey(event, index)}>{item.label}</button>)}</div>
    <div key={tab} className={styles.panel} id="trips-panel" role="tabpanel" aria-labelledby={`trips-tab-${tab}`} tabIndex={0}>
      {query.isError ? <div className={styles.empty} role="alert"><h2>We couldn&apos;t load your trips</h2><p>{query.error.message}</p><button type="button" className="outline-button" onClick={() => { void query.refetch(); }} disabled={query.isFetching}>{query.isFetching ? "Trying again..." : "Try again"}</button></div>
        : trips.length === 0 ? <EmptyTrips tab={tab} />
        : <><h2 className={styles.groupTitle}>{tab === "upcoming" ? "Your upcoming reservations" : tab === "past" ? "Where you've been" : "Cancelled reservations"}</h2><div className={tab === "past" ? styles.pastGrid : styles.tripList}>{trips.map(booking => <TripCard key={booking.id} booking={booking} compact={tab === "past"} highlight={booking.id === highlight} today={today} onCancel={value => { setCancelError(""); setCancel(value); setCancelOpen(true); }} onReview={value => { setReview(value); setReviewSession(session => session + 1); setReviewOpen(true); }} onOpen={value => { setDetail(value); setDetailOpen(true); }} onMessage={setCompose} />)}</div></>}
    </div>
    {cancel && <Modal open={cancelOpen} title="Cancel your trip?" onClose={() => { if (!cancellation.isPending) setCancelOpen(false); }} footer={<div className={styles.confirmActions}><button type="button" className="outline-button" disabled={cancellation.isPending} onClick={() => setCancelOpen(false)}>Keep trip</button><button type="button" className={styles.dangerButton} disabled={cancellation.isPending||cooldown.blocked} onClick={() => { if (cancelOpen && !cancellation.isPending && !cooldown.blocked) cancellation.mutate(cancel); }}>{cancellation.isPending ? "Cancelling..." : "Cancel trip"}</button></div>}>
      <div className={styles.cancelBody}><h3>{cancel.listing.title}</h3><p>{formatDateRange(cancel.check_in, cancel.check_out)}</p><p>This cannot be undone.</p>{cancelError && <p className="error-text" role="alert">{cancelError}</p>}</div>
    </Modal>}
    {detail&&<Modal open={detailOpen} title="Your reservation" width={760} onClose={()=>setDetailOpen(false)}><div className="trip-detail"><h2>{detail.listing.title}</h2><p>{formatDateRange(detail.check_in,detail.check_out)} · {detail.guests} guests</p><h3>Address</h3><p>{detail.listing.address}<br/>{detail.listing.neighbourhood}, {detail.listing.city}, {detail.listing.country}</p>{Number.isFinite(detail.listing.latitude)&&Number.isFinite(detail.listing.longitude)&&<BookingLocationMap latitude={detail.listing.latitude} longitude={detail.listing.longitude} label={detail.listing.title}/>}<h3>Price details</h3><dl><div><dt>{formatPrice(detail.nightly_rate)} × {detail.nights} nights</dt><dd>{formatPrice(detail.subtotal)}</dd></div>{detail.discount > 0 && <div className={styles.discount}><dt>Weekly stay discount</dt><dd>−{formatPrice(detail.discount)}</dd></div>}<div><dt>Cleaning fee</dt><dd>{formatPrice(detail.cleaning_fee)}</dd></div><div><dt>Airbnb service fee</dt><dd>{formatPrice(detail.service_fee)}</dd></div><div><dt><strong>Total before taxes</strong></dt><dd><strong>{formatPrice(detail.total)}</strong></dd></div></dl><button className="outline-button" onClick={()=>{setCompose(detail);setDetailOpen(false);}}>Message host</button></div></Modal>}
    {compose&&<ComposeMessageModal open onClose={()=>setCompose(null)} listingId={compose.listing.id} hostName={compose.listing.host.name}/>}
    {review && <ReviewModal key={reviewSession} open={reviewOpen} booking={review} onClose={() => setReviewOpen(false)} />}
  </section>;
}
