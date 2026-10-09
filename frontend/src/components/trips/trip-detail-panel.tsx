"use client";

import { ArrowLeft, Share } from "lucide-react";
import { AppImage } from "@/components/ui/app-image";
import { formatDateRange } from "@/lib/format";
import { parseDate } from "@/lib/dates";
import type { Booking } from "@/types/api";
import styles from "./trips.module.css";

export function TripDetailPanel({ booking, onBack, onReservation, onShare }: {
  booking: Booking; onBack: () => void; onReservation: () => void; onShare: () => void;
}) {
  const hostName = booking.listing.host.name.split(" ")[0];
  return <div className={styles.detailPanel}>
    <div className={styles.detailHeading}>
      <button type="button" className={styles.detailBack} aria-label="Back to trip list" onClick={onBack}><ArrowLeft size={20} aria-hidden="true" /></button>
      <h1 tabIndex={-1}>{booking.listing.city}</h1>
    </div>
    <section className={styles.stayCard} aria-label="Your stay">
      <button type="button" className={styles.stayButton} onClick={onReservation} aria-label={`View reservation for ${booking.listing.title}`}>
        <span className={styles.stayPhoto}>{booking.listing.cover_image_url && <AppImage src={booking.listing.cover_image_url} alt="" fill sizes="106px" />}</span>
        <span><strong>Your stay</strong><span>Hosted by {hostName}</span><small>{formatDateRange(booking.check_in, booking.check_out)}</small></span>
      </button>
      <button type="button" className={styles.shareStay} onClick={onShare}><Share size={16} aria-hidden="true" />Share listing</button>
    </section>
    <div className={styles.timeline}>
      {([
        [booking.check_in, "Check-in", "After 12:00 pm", "c009db8a-b049-471f-9d3e-8cabfb50f1c2"],
        [booking.check_out, "Checkout", "Before 11:00 am", "4b9f50ac-0bec-40e6-bc55-ae8d9da28bbb"],
      ] as const).map(([date, label, time, image]) => <div key={label} className={styles.timelineRow}>
        <div className={styles.timelineDate}><span>{parseDate(date).toLocaleDateString("en-GB", { weekday: "short" })}</span><strong>{parseDate(date).getDate()}</strong></div>
        <button type="button" className={styles.timelineEvent} onClick={onReservation}><span className={styles.eventIcon}><AppImage src={`https://a0.muscache.com/im/pictures/AirbnbPlatformAssets/AirbnbPlatformAssets-trips-tab/original/${image}.png?im_w=120`} alt="" width={41} height={41} /></span><span className={styles.eventCopy}><strong>{label}</strong><span>{time}</span></span></button>
      </div>)}
    </div>
    {booking.status === "cancelled" && <p className={styles.cancelledNotice}>This reservation was cancelled.</p>}
    <button type="button" className={styles.reservationButton} onClick={onReservation}>Reservation details</button>
  </div>;
}
