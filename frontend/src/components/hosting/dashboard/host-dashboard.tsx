"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AppImage as Image } from "@/components/ui/app-image";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, House, LoaderCircle, MoreHorizontal, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { deleteListing, getHostBookings, getHostListings, queryKeys } from "@/lib/api";
import { parseDate, toDateString } from "@/lib/dates";
import { formatDateRange, formatPrice, plural } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { Modal } from "@/components/ui/modal";
import type { HostBooking, HostListing } from "@/types/api";
import styles from "./host-dashboard.module.css";
import { GuestReviewModal } from "./guest-review-modal";

const reservationTabs = [
  { id: "checking-out", label: "Checking out", empty: "You don't have any guests checking out today or tomorrow." },
  { id: "hosting", label: "Currently hosting", empty: "You aren't hosting any guests right now." },
  { id: "arriving", label: "Arriving soon", empty: "You don't have any guests arriving in the next 7 days." },
  { id: "upcoming", label: "Upcoming", empty: "You don't have any upcoming reservations yet." },
  { id: "past", label: "Past", empty: "Your completed reservations will appear here." },
  { id: "cancelled", label: "Cancelled", empty: "You don't have any cancelled reservations." },
] as const;
type ReservationTab = (typeof reservationTabs)[number]["id"];

function groupedReservations(bookings: HostBooking[], today: string, tab: ReservationTab): HostBooking[] {
  const tomorrowDate = parseDate(today);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const weekDate = parseDate(today);
  weekDate.setDate(weekDate.getDate() + 7);
  const tomorrow = toDateString(tomorrowDate), week = toDateString(weekDate);
  return bookings.filter(booking => {
    if (tab === "cancelled") return booking.status === "cancelled";
    if (booking.status !== "confirmed") return false;
    switch (tab) {
      case "checking-out": return booking.check_out >= today && booking.check_out <= tomorrow;
      case "hosting": return booking.check_in <= today && booking.check_out > today;
      case "arriving": return booking.check_in >= today && booking.check_in <= week;
      case "upcoming": return booking.check_in > today;
      case "past": return booking.check_out <= today;
    }
  });
}

function shortDate(value: string) {
  return parseDate(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function BookingStatus({ booking, today }: { booking: HostBooking; today: string }) {
  const completed = booking.status === "confirmed" && booking.check_out <= today;
  return <span className={`${styles.status} ${booking.status === "cancelled" ? styles.cancelled : completed ? styles.completed : ""}`}>{booking.status === "cancelled" ? "Cancelled" : completed ? "Completed" : "Confirmed"}</span>;
}

function Guest({ booking }: { booking: HostBooking }) {
  return <div className={styles.guest}>{booking.guest.avatar_url ? <Image src={booking.guest.avatar_url} alt="" width={32} height={32} className={styles.avatar} /> : <span className={styles.initials} aria-hidden="true">{booking.guest.name.split(" ").map(part => part[0]).slice(0, 2).join("")}</span>}<span><Link href={`/users/${booking.guest.id}`}><strong>{booking.guest.name}</strong></Link><small>{plural(booking.guests, "guest")}</small></span></div>;
}

function ListingCard({ listing, onDelete }: { listing: HostListing; onDelete: (listing: HostListing) => void }) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    function pointer(event: PointerEvent) {
      if (event.target instanceof Node && !menu.current?.contains(event.target)) setOpen(false);
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
        const current = items.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        items[(current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }
    document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", keyboard);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", keyboard); };
  }, [open]);
  const cover = listing.image_urls[0];
  return <article className={styles.listingCard}>
    <div className={styles.photo}>
      <Link href={`/rooms/${listing.id}`} aria-label={`View ${listing.title}`}>
        {cover ? <Image src={cover} alt={listing.title} fill sizes="(max-width:549px) calc(100vw - 48px), (max-width:949px) 45vw, (max-width:1439px) 30vw, 22vw" /> : <div className={styles.noPhoto}><House size={32} /><span>No photo available</span></div>}
      </Link>
      <div className={styles.menuContainer} ref={menu}>
        <button className={styles.menuTrigger} type="button" ref={trigger} aria-label={`Actions for ${listing.title}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(value => !value)}><MoreHorizontal size={20} /></button>
        {open && <div className={styles.menu} role="menu">
          <Link role="menuitem" href={`/hosting/listings/${listing.id}/edit`} onClick={() => setOpen(false)}>Edit</Link>
          <Link role="menuitem" href={`/hosting/listings/${listing.id}/calendar`} onClick={() => setOpen(false)}>Calendar</Link>
          <Link role="menuitem" href={`/rooms/${listing.id}`} onClick={() => setOpen(false)}>View listing</Link>
          <button role="menuitem" type="button" className={styles.deleteAction} onClick={() => { setOpen(false); trigger.current?.focus(); onDelete(listing); }}>Remove listing</button>
        </div>}
      </div>
    </div>
    <Link href={`/hosting/listings/${listing.id}/edit`} className={styles.listingCopy}><h3>{listing.title}</h3><p>{listing.neighbourhood}, {listing.city}</p><p className={styles.price}><strong>{formatPrice(listing.price_per_night)}</strong> night</p></Link>
    <p className={styles.reservationCount}>{plural(listing.upcoming_booking_count, "upcoming reservation")}</p><Link className={styles.calendarLink} href={`/hosting/listings/${listing.id}/calendar`}>Manage calendar</Link>
  </article>;
}

function DashboardSkeleton() {
  return <div className={styles.dashboard} aria-busy="true" aria-label="Loading your hosting dashboard"><div className={`skeleton ${styles.headingSkeleton}`} /><div className={`skeleton ${styles.sectionSkeleton}`} /><div className={styles.listingGrid}>{[0, 1, 2, 3].map(index => <div key={index}><div className={`skeleton ${styles.photo}`} /><div className={`skeleton ${styles.copySkeleton}`} /></div>)}</div><span className={styles.screenReader}>Loading your hosting dashboard</span></div>;
}

export function HostDashboard() {
  const { status, user, openAuth } = useAuth();
  const client = useQueryClient();
  const removalCooldown = useApiCooldown();
  const [tab, setTab] = useState<ReservationTab>("upcoming"), [listingId, setListingId] = useState<number | undefined>();
  const [reviewGuest,setReviewGuest] = useState<HostBooking|null>(null);
  const [deleting, setDeleting] = useState<HostListing | null>(null);
  const authPrompted = useRef(false);
  const listings = useQuery({ queryKey: queryKeys.hostListings, queryFn: ({ signal }) => getHostListings(signal), enabled: status === "authenticated" });
  const bookings = useQuery({ queryKey: [...queryKeys.hostBookings, listingId ?? "all"], queryFn: ({ signal }) => getHostBookings(listingId, signal), enabled: status === "authenticated" && (listings.data?.length ?? 0) > 0 });
  useEffect(() => {
    if (status === "anonymous" && !authPrompted.current) { authPrompted.current = true; openAuth(); }
  }, [status, openAuth]);
  const deletion = useMutation({
    mutationFn: deleteListing,
    onError: error => { removalCooldown.record(error); toast.error(error.message); },
    onSuccess: async (_result, id) => {
      client.setQueryData<HostListing[]>(queryKeys.hostListings, current => current?.filter(listing => listing.id !== id));
      if (listingId === id) setListingId(undefined);
      setDeleting(null); toast("Listing removed");
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.hostListings }),
        client.invalidateQueries({ queryKey: queryKeys.hostBookings }),
        client.invalidateQueries({ queryKey: ["listings"] }),
        client.invalidateQueries({ queryKey: queryKeys.listing(id) }),
        client.invalidateQueries({ queryKey: queryKeys.wishlist }),
        client.invalidateQueries({ queryKey: queryKeys.savedListings }),
      ]);
    },
  });
  const closeDelete = useCallback(() => { if (!deletion.isPending) setDeleting(null); }, [deletion.isPending]);
  function askDelete(listing: HostListing) { deletion.reset(); setDeleting(listing); }
  if (status === "loading" || (status === "authenticated" && listings.isPending)) return <DashboardSkeleton />;
  if (status === "anonymous") return <div className={styles.authBlock}><House size={56} strokeWidth={1.5} aria-hidden="true" /><h1>Log in to start hosting</h1><p>Manage your listings and welcome your next guests.</p><button className="dark-button" type="button" onClick={() => openAuth()}>Log in</button></div>;
  if (listings.isError) return <div className={styles.authBlock}><House size={56} strokeWidth={1.5} aria-hidden="true" /><h1>We couldn&apos;t load your listings</h1><p role="alert">{listings.error.message}</p><button className="outline-button" type="button" onClick={() => void listings.refetch()}><RefreshCw size={16} aria-hidden="true" />Try again</button></div>;
  if (!listings.data?.length) return <div className={styles.authBlock}><House size={56} strokeWidth={1.5} aria-hidden="true" /><h1>Become a host</h1><p>You have no listings yet. Share your place and help guests feel at home.</p><Link className="gradient-button" href="/hosting/listings/new">Get started</Link></div>;
  const today = toDateString(new Date()), allBookings = bookings.data ?? [];
  const activeTab = reservationTabs.find(item => item.id === tab) ?? reservationTabs[3];
  const visibleBookings = groupedReservations(allBookings, today, tab);
  return <div className={styles.dashboard}>
    <h1>Welcome back, {user?.name.split(" ")[0]}</h1>
    <section id="host-reservations" className={styles.reservations} aria-labelledby="reservations-heading">
      <div className={styles.sectionHeader}><h2 id="reservations-heading">Your reservations</h2><label className={styles.listingFilter}>Listing<select value={listingId ?? "all"} onChange={event => setListingId(event.target.value === "all" ? undefined : Number(event.target.value))}><option value="all">All listings</option>{listings.data.map(listing => <option key={listing.id} value={listing.id}>{listing.title}</option>)}</select></label></div>
      <div className={styles.tabs} role="tablist" aria-label="Reservation status">{reservationTabs.map((item, index) => <button type="button" key={item.id} role="tab" id={`host-tab-${item.id}`} aria-selected={tab === item.id} aria-controls="host-reservation-panel" tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft" || event.key === "Home" || event.key === "End") { event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? reservationTabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + reservationTabs.length) % reservationTabs.length; const nextTab = reservationTabs[next]; if (nextTab) { setTab(nextTab.id); document.getElementById(`host-tab-${nextTab.id}`)?.focus(); } } }}>{item.label}{!bookings.isPending && !bookings.isError && <span> ({groupedReservations(allBookings, today, item.id).length})</span>}</button>)}</div>
      <div key={`${tab}-${listingId ?? 'all'}`} className={styles.reservationPanel} id="host-reservation-panel" role="tabpanel" aria-labelledby={`host-tab-${tab}`} aria-busy={bookings.isFetching}>
        {bookings.isPending ? <div className={styles.reservationSkeleton} aria-label="Loading reservations">{[0, 1, 2].map(index => <div key={index} className="skeleton" />)}</div> : bookings.isError ? <div className={styles.empty}><p role="alert">{bookings.error.message}</p><button className="outline-button" type="button" onClick={() => void bookings.refetch()}>Try again</button></div> : !visibleBookings.length ? <div className={styles.empty}><ClipboardCheck size={36} strokeWidth={1.5} aria-hidden="true" /><p>{activeTab.empty}</p></div> : <>
          <div className={styles.tableWrap}><table className={styles.table}><caption className={styles.screenReader}>{activeTab.label} reservations</caption><thead><tr><th scope="col">Status</th><th scope="col">Guest</th><th scope="col">Check-in</th><th scope="col">Checkout</th><th scope="col">Booked</th><th scope="col">Listing</th><th scope="col">Booking total</th><th scope="col">Review</th></tr></thead><tbody>{visibleBookings.map(booking => <tr key={booking.id}><td><BookingStatus booking={booking} today={today} /></td><td><Guest booking={booking} /></td><td>{shortDate(booking.check_in)}</td><td>{shortDate(booking.check_out)}</td><td>{new Date(booking.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td><td><Link className={styles.listingLink} href={`/rooms/${booking.listing.id}`}>{booking.listing.title}</Link></td><td className={styles.total}>{formatPrice(booking.total)}</td><td>{booking.status==="confirmed"&&booking.check_out<=today&&(booking.has_guest_review?<span className="muted small">Reviewed</span>:<button className="text-button" onClick={()=>setReviewGuest(booking)}>Review guest</button>)}</td></tr>)}</tbody></table></div>
          <div className={styles.mobileReservations}>{visibleBookings.map(booking => <article key={booking.id} className={styles.reservationCard}><div className={styles.reservationTop}><Guest booking={booking} /><BookingStatus booking={booking} today={today} /></div><Link href={`/rooms/${booking.listing.id}`} className={styles.reservationListing}>{booking.listing.title}</Link><p>{formatDateRange(booking.check_in, booking.check_out)} · {plural(booking.nights, "night")}</p><dl><div><dt>Booked</dt><dd>{new Date(booking.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</dd></div><div><dt>Booking total</dt><dd>{formatPrice(booking.total)}</dd></div></dl>{booking.status==="confirmed"&&booking.check_out<=today&&(booking.has_guest_review?<span className="muted small">Reviewed</span>:<button className="text-button" onClick={()=>setReviewGuest(booking)}>Review guest</button>)}</article>)}</div>
          <p className={styles.totalNote}>Booking totals include guest fees. Host payouts aren&apos;t provided by this demo.</p>
        </>}
      </div>
    </section>
    <section id="host-listings" className={styles.listings} aria-labelledby="listings-heading"><div className={styles.sectionHeader}><h2 id="listings-heading">Your listings <span className={styles.listingCount}>({listings.data.length})</span></h2><Link href="/hosting/listings/new" className="outline-button"><Plus size={18} aria-hidden="true" />Create listing</Link></div><div className={styles.listingGrid}>{listings.data.map(listing => <ListingCard key={listing.id} listing={listing} onDelete={askDelete} />)}</div></section>
    {reviewGuest&&<GuestReviewModal key={reviewGuest.id} booking={reviewGuest} onClose={()=>setReviewGuest(null)}/>}
    <Modal open={deleting !== null} onClose={closeDelete} title="Remove this listing?" footer={<div className={styles.confirmActions}><button className="text-button" type="button" disabled={deletion.isPending} onClick={closeDelete}>Cancel</button><button className={styles.dangerButton} type="button" disabled={deletion.isPending || removalCooldown.blocked} onClick={() => { if (deleting && !deletion.isPending && !removalCooldown.blocked) deletion.mutate(deleting.id); }}>{deletion.isPending ? <><LoaderCircle size={18} className={styles.spin} aria-hidden="true" />Removing…</> : "Remove listing"}</button></div>}>
      <div className={styles.deleteBody}><h3>{deleting?.title}</h3><p>Guests will no longer see this listing. Past trips and reviews stay.</p>{deleting && deleting.upcoming_booking_count > 0 && <p>This listing has {plural(deleting.upcoming_booking_count, "upcoming reservation")}. Complete or cancel upcoming reservations before removing this listing.</p>}{deletion.isError && <p className="error-text" role="alert">{deletion.error.message}</p>}</div>
    </Modal>
  </div>;
}
