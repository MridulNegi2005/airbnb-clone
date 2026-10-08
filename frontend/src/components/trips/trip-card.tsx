import { AppImage as Image } from "@/components/ui/app-image";
import Link from "next/link";
import { ImageOff, MapPin } from "lucide-react";
import { formatTripDateRange } from "@/lib/format";
import type { Booking } from "@/types/api";
import styles from "./trips.module.css";

export function TripCard({ booking, highlight, selected, today, onOpen }: {
  booking: Booking; highlight: boolean; selected: boolean; today: string;
  onOpen: (booking: Booking) => void;
}) {
  const host = booking.listing.host;
  const cancelled = booking.status === "cancelled";
  const upcoming = !cancelled && booking.check_out > today;
  const status = cancelled ? "Cancelled" : booking.check_in <= today ? "In progress" : "Upcoming";
  return <article id={`trip-${booking.id}`} className={`${styles.tripCard} ${highlight ? styles.highlight : ""}`}>
    <button type="button" className={styles.cardButton} aria-label={`View trip to ${booking.listing.city}, ${formatTripDateRange(booking.check_in, booking.check_out)}`} aria-pressed={selected} onClick={() => onOpen(booking)}>
      <span className={styles.photo}>
        {booking.listing.cover_image_url ? <Image src={booking.listing.cover_image_url} alt="" fill sizes="96px" /> : <ImageOff size={24} aria-hidden="true" />}
      </span>
      <span className={styles.cardInfo}>
        <span className={styles.city}>{booking.listing.city}</span>
        <span className={styles.dates}>{formatTripDateRange(booking.check_in, booking.check_out)}</span>
        <span className={styles.hostRow}>
          {host.avatar_url && <span className={styles.hostAvatar}><Image src={host.avatar_url} alt="" fill sizes="24px" /></span>}
          <span>Hosted by {host.name}</span>
          {(cancelled || upcoming) && <span className={styles.status}>{status}</span>}
        </span>
      </span>
    </button>
  </article>;
}

export function EmptyTrips({ cancelled = false }: { cancelled?: boolean }) {
  return <div className={styles.empty}>
    <MapPin size={32} strokeWidth={1.5} aria-hidden="true" />
    <h2>{cancelled ? "No cancelled reservations" : "No trips booked...yet!"}</h2>
    {!cancelled && <><p>Time to dust off your bags and start planning your next adventure.</p><Link className="outline-button" href="/">Start searching</Link></>}
  </div>;
}
