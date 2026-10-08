"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Check } from "lucide-react";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";
import { ApiError, createBooking, getBookedDates, getListing, getQuote, queryKeys } from "@/lib/api";
import { parseDate, toDateString, validateStay } from "@/lib/dates";
import { formatDateRange, formatGuests } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { Modal } from "@/components/ui/modal";
import { ComposeMessageModal } from "@/components/messages/compose-message-modal";
import { cancellationPolicy } from "@/lib/constants";
import { CheckoutSkeleton } from "./checkout-skeleton";
import { CheckoutSummaryCard } from "./checkout-summary-card";
import { EditDatesModal, EditGuestsModal, type TripGuests } from "./edit-trip-modals";
import { PaymentForm } from "./payment-form";
import styles from "./booking.module.css";

function numberParam(value: string | null, fallback: number, max: number) {
  const parsed = value === null || value === "" ? fallback : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? Math.min(parsed, max) : fallback;
}
function dateRange(checkIn: string, checkOut: string): DateRange | undefined {
  return validateStay(checkIn, checkOut) ? undefined : { from: parseDate(checkIn), to: parseDate(checkOut) };
}

export function CheckoutClient({ id }: { id: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const cache = useQueryClient();const cooldown=useApiCooldown();
  const { user, status, openAuth } = useAuth();
  const prompted = useRef(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const checkIn = params.get("checkin") ?? "";
  const checkOut = params.get("checkout") ?? "";
  const listingUrl = `/rooms/${id}${params.size ? `?${params}` : ""}`;
  useEffect(() => {
    if (status === "anonymous" && !prompted.current) {
      prompted.current = true;
      openAuth(undefined, () => router.replace(listingUrl));
    }
  }, [status, openAuth, router, listingUrl]);
  const validId = Number.isSafeInteger(id) && id > 0;
  const listing = useQuery({ queryKey: queryKeys.listing(id), queryFn: ({ signal }) => getListing(id, signal), enabled: validId });
  const availability = useQuery({ queryKey: queryKeys.availability(id), queryFn: ({ signal }) => getBookedDates(id, signal), enabled: validId });
  const maxGuests = listing.data?.max_guests ?? 16;
  const adults = Math.max(1, numberParam(params.get("adults"), 1, maxGuests));
  const guests: TripGuests = { adults, children: numberParam(params.get("children"), 0, Math.max(0, maxGuests - adults)), infants: numberParam(params.get("infants"), 0, 5), pets: numberParam(params.get("pets"), 0, 5) };
  const stay = { check_in: checkIn, check_out: checkOut, guests: guests.adults + guests.children };
  const dateError = validateStay(checkIn, checkOut, availability.data);
  const quote = useQuery({ queryKey: queryKeys.quote(id, stay), queryFn: ({ signal }) => getQuote(id, stay, signal), enabled: validId && Boolean(listing.data) && availability.isSuccess && !dateError });
  function updateTrip(values: Record<string, string>) {
    const next = new URLSearchParams(params);
    Object.entries(values).forEach(([key, value]) => next.set(key, value));
    setSubmitError(null);
    router.replace(`/book/${id}?${next}`, { scroll: false });
  }
  const booking = useMutation({
    mutationFn: async () => {
      if (!user) throw new ApiError(401, "Log in to confirm your trip.");
      if (user.id === listing.data?.host.id) throw new ApiError(403, "You cannot book your own listing.");
      const latestDates = await cache.fetchQuery({ queryKey: queryKeys.availability(id), queryFn: ({ signal }) => getBookedDates(id, signal), staleTime: 0 });
      const validation = validateStay(checkIn, checkOut, latestDates);
      if (validation) throw new ApiError(409, validation);
      if (stay.guests < 1 || stay.guests > maxGuests) throw new ApiError(422, `Choose no more than ${maxGuests} guests.`);
      const latestQuote = await cache.fetchQuery({ queryKey: queryKeys.quote(id, stay), queryFn: ({ signal }) => getQuote(id, stay, signal), staleTime: 0 });
      if (!latestQuote.available) throw new ApiError(409, "Those dates are no longer available.");
      if (quote.data && quote.data.total !== latestQuote.total) throw new ApiError(400, "The price has changed. Review the updated total and confirm again.");
      return createBooking({ listing_id: id, ...stay });
    },
    onSuccess: async result => {
      await Promise.all([cache.invalidateQueries({ queryKey: queryKeys.bookings }), cache.invalidateQueries({ queryKey: queryKeys.availability(id) }), cache.invalidateQueries({ queryKey: ["quote", id] }), cache.invalidateQueries({ queryKey: ["listings"] }), cache.invalidateQueries({ queryKey: queryKeys.hostBookings }), cache.invalidateQueries({ queryKey: queryKeys.hostListings })]);
      toast.success("Your trip is booked!", { icon: <Check size={18} /> });
      router.replace(`/trips?booking=${result.id}`);
    },
    onError: error => {
      cooldown.record(error);
      if (error instanceof ApiError && error.status === 409) {
        toast.error("Those dates are no longer available");
        void availability.refetch();
        setDatesOpen(true);
      } else if (error instanceof ApiError) setSubmitError(error.message);
      else { toast.error("Something went wrong. Please try again."); setSubmitError("We could not confirm your booking. Your form is still here; please try again."); }
    },
  });
  if (status === "loading" || (validId && listing.isPending)) return <CheckoutSkeleton />;
  if (!validId || (listing.error instanceof ApiError && listing.error.status === 404)) return <section className={styles.page}><h1>We couldn&apos;t find this place</h1><p>This listing may no longer be available.</p><Link href="/" className={styles.outlineButton}>Start exploring</Link></section>;
  if (!listing.data) return <section className={styles.page}><h1>Something went wrong</h1><p>We couldn&apos;t load the listing. Please try again.</p><button className={styles.outlineButton} onClick={() => void listing.refetch()}>Try again</button></section>;
  const property = listing.data;
  const quoteError = quote.error instanceof Error ? quote.error.message : quote.data && !quote.data.available ? "Those dates are no longer available. Edit your dates to continue." : null;
  const disabled = cooldown.blocked || status !== "authenticated" || Boolean(dateError) || !availability.isSuccess || quote.isFetching || !quote.data?.available || Boolean(quoteError) || user?.id === property.host.id;
  const tripDetails = <section className={styles.tripDetails}>
          <h2 className={styles.srOnly}>Your trip</h2>
          <div className={styles.tripRow}><div><h3>Dates</h3><p>{dateRange(checkIn, checkOut) ? formatDateRange(checkIn, checkOut) : "Add your travel dates"}</p></div><button type="button" className={styles.changeButton} aria-label="Edit dates" disabled={booking.isPending} onClick={() => setDatesOpen(true)}>Change</button></div>
          <div className={styles.tripRow}><div><h3>Guests</h3><p>{formatGuests(guests)}</p></div><button type="button" className={styles.changeButton} aria-label="Edit guests" disabled={booking.isPending} onClick={() => setGuestsOpen(true)}>Change</button></div>
          {dateError && <p className={styles.error} role="alert">{dateError} <button type="button" className={styles.textButton} onClick={() => setDatesOpen(true)}>Change dates</button></p>}
          {availability.isError && <p className={styles.error} role="alert">We could not load availability. <button type="button" className={styles.textButton} onClick={() => void availability.refetch()}>Try again</button></p>}
          {availability.isPending && <p className={styles.secondary} aria-live="polite">Checking availability...</p>}
        </section>;
  return <section className={styles.page}>
    <div className={styles.titleRow}><Link href={listingUrl} className={styles.backButton} aria-label="Back to listing"><ChevronLeft size={22} strokeWidth={2} /></Link><h1>Confirm and pay</h1></div>
    <div className={styles.layout}>
      <div className={styles.main}>

        {status === "anonymous" ? <section className={styles.section}><h2>Log in to book your trip</h2><p>Your dates and guests will be kept while you log in.</p><button type="button" className={styles.darkButton} onClick={() => openAuth(undefined, () => router.replace(listingUrl))}>Log in</button></section> : <>
          {user?.id === property.host.id && <p className={styles.error} role="alert">You cannot book your own listing.</p>}
          <PaymentForm host={property.host} onMessage={() => setMessageOpen(true)} pending={booking.isPending} disabled={disabled} error={submitError} onConfirm={() => { if (disabled || booking.isPending) return; setSubmitError(null); booking.mutate(); }} onComingSoon={setComingSoon} />
        </>}
      </div>
      <CheckoutSummaryCard listing={property} quote={!dateError ? quote.data : undefined} loading={quote.isFetching} error={quoteError} onRetry={() => void quote.refetch()} onPolicy={() => setPolicyOpen(true)}>{tripDetails}</CheckoutSummaryCard>
    </div>
    {datesOpen && <EditDatesModal initial={dateRange(checkIn, checkOut)} bookedRanges={availability.data ?? []} ready={availability.isSuccess && !availability.isFetching} failed={availability.isError} onRetry={() => void availability.refetch()} onClose={() => setDatesOpen(false)} onSave={range => { if (range.from && range.to && availability.isSuccess) { updateTrip({ checkin: toDateString(range.from), checkout: toDateString(range.to) }); setDatesOpen(false); } }} />}
    {guestsOpen && <EditGuestsModal initial={guests} max={maxGuests} onClose={() => setGuestsOpen(false)} onSave={value => { updateTrip(Object.fromEntries(Object.entries(value).map(([key, count]) => [key, String(count)]))); setGuestsOpen(false); }} />}
    <Modal open={comingSoon !== null} onClose={() => setComingSoon(null)} title={comingSoon ?? "Coming soon"}><h2>Coming soon</h2><p>This demo does not support {comingSoon?.toLowerCase()} yet. You can still complete your demo reservation.</p></Modal>
    {messageOpen && <ComposeMessageModal open listingId={id} hostName={property.host.name} onClose={() => setMessageOpen(false)} />}
    <Modal open={policyOpen} onClose={() => setPolicyOpen(false)} title="Cancellation policy"><p>{cancellationPolicy}</p></Modal>
  </section>;
}
