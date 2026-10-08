import { AppImage as Image } from "@/components/ui/app-image";
import Link from "next/link";
import { ImageOff, MapPin } from "lucide-react";
import { formatTripDateRange } from "@/lib/format";
import type { Booking, UserPublic } from "@/types/api";
import styles from "./trips.module.css";

export function TripCard({ booking, highlight, selected, today, onOpen, guest }: {
  booking: Booking; highlight: boolean; selected: boolean; today: string;
  onOpen: (booking: Booking) => void; guest?: Pick<UserPublic, "name" | "avatar_url"> | null;
}) {
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
          {guest && <span className={styles.hostAvatar}>{guest.avatar_url ? <Image src={guest.avatar_url} alt={guest.name} fill sizes="24px" /> : <span className={styles.guestInitial}>{guest.name[0]}</span>}</span>}
          {booking.guests > 1 && <span className={styles.guestCount} aria-label={`${booking.guests - 1} other ${booking.guests === 2 ? "guest" : "guests"}`}>+{booking.guests - 1}</span>}
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
