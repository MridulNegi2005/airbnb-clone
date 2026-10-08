import { AppImage as Image } from "@/components/ui/app-image";
import Link from "next/link";
import { Check, MapPin, ImageOff } from "lucide-react";
import { parseDate } from "@/lib/dates";
import { formatDateRange, formatMonthYear, formatPrice, plural } from "@/lib/format";
import type { Booking } from "@/types/api";
import styles from "./trips.module.css";

const roomNames = { entire_home: "Entire home", private_room: "Private room", shared_room: "Shared room" };

function TripPhoto({ booking, small = false }: { booking: Booking; small?: boolean }) {
  return <div className={small ? styles.smallPhoto : styles.photo}>
    {booking.listing.cover_image_url ? <Image src={booking.listing.cover_image_url} alt={booking.listing.title} fill sizes={small ? "64px" : "(max-width: 743px) calc(100vw - 48px), 450px"} />
      : <div className={styles.noPhoto}><ImageOff size={24} aria-hidden="true" /><span>Photo unavailable</span></div>}
  </div>;
}

export function TripCard({ booking, compact, highlight, today, onCancel, onReview, onOpen, onMessage }: {
  booking: Booking; compact: boolean; highlight: boolean; today: string;
  onCancel: (booking: Booking) => void; onReview: (booking: Booking) => void; onOpen:(booking:Booking)=>void; onMessage:(booking:Booking)=>void;
}) {
  const cancelled = booking.status === "cancelled";
  const inProgress = booking.check_in <= today && booking.check_out > today && !cancelled;
  if (compact) return <article id={`trip-${booking.id}`} className={styles.pastCard}>
    <Link href={`/rooms/${booking.listing.id}`} className={styles.pastSummary}>
      <TripPhoto booking={booking} small />
      <div><h2>{booking.listing.city}</h2><p>Hosted by {booking.listing.host.name}</p><p>{formatMonthYear(booking.check_in)}</p></div>
    </Link>
    <div className={styles.pastActions}><button className="text-button" onClick={()=>onOpen(booking)}>View trip</button>{booking.has_review ? <span className={styles.reviewed}><Check size={16} aria-hidden="true" />Reviewed</span>
      : <button type="button" className={`outline-button ${styles.smallButton}`} onClick={() => onReview(booking)}>Leave a review</button>}</div>
  </article>;
  const year = parseDate(booking.check_in).getFullYear();
  return <article id={`trip-${booking.id}`} className={`${styles.tripCard} ${highlight ? styles.highlight : ""}`}>
    <div className={styles.tripInfo}>
      <div><span className={styles.status}>{cancelled ? "Cancelled" : inProgress ? "In progress" : "Confirmed"}</span>
        <h2>{booking.listing.city}</h2><p className={styles.host}>{roomNames[booking.listing.room_type]} hosted by {booking.listing.host.name}</p></div>
      <div className={styles.tripDetails}><div><span className={styles.secondary}>Your stay</span><strong>{formatDateRange(booking.check_in, booking.check_out)}</strong><span className={styles.secondary}>{year}</span></div>
        <div><span className={styles.secondary}>Where you&apos;re going</span><strong>{booking.listing.city}, {booking.listing.country}</strong><span className={styles.secondary}>{plural(booking.guests, "guest")}</span></div></div>
      <p className={styles.total}>{plural(booking.nights, "night")} <span>{formatPrice(booking.total)} total</span></p>
      <div className={styles.actions}><button className="text-button" onClick={()=>onOpen(booking)}>View trip</button><button className="text-button" onClick={()=>onMessage(booking)}>Message host</button><Link href={`/rooms/${booking.listing.id}`}>View listing</Link>
        {!cancelled && booking.check_in > today && <button className={`outline-button ${styles.smallButton}`} type="button" onClick={() => onCancel(booking)}>Cancel trip</button>}</div>
      {inProgress && <p className={styles.secondary}>This stay has started and can no longer be cancelled.</p>}
    </div>
    <Link href={`/rooms/${booking.listing.id}`} className={styles.photoLink} aria-label={`View ${booking.listing.title}`}><TripPhoto booking={booking} /></Link>
  </article>;
}

export function EmptyTrips({ tab }: { tab: "upcoming" | "past" | "cancelled" }) {
  return <div className={styles.empty}>
    <MapPin size={32} strokeWidth={1.5} aria-hidden="true" />
    <h2>{tab === "upcoming" ? "No trips booked...yet!" : tab === "past" ? "You have no past trips." : "You have no cancelled trips."}</h2>
    {tab === "upcoming" && <p>Time to dust off your bags and start planning your next adventure.</p>}
    <Link className="outline-button" href="/">Start searching</Link>
  </div>;
}
