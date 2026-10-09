"use client";
import { useState, useSyncExternalStore } from "react";
import type { DateRange } from "react-day-picker";
import { Modal } from "@/components/ui/modal";
import { DatePicker } from "@/components/calendar/lazy-date-picker";
import { Stepper } from "@/components/ui/stepper";
import { toDateString, validateStay } from "@/lib/dates";
import { formatGuests } from "@/lib/format";
import type { BookedRange } from "@/types/api";
import styles from "./booking.module.css";

export type TripGuests = { adults: number; children: number; infants: number; pets: number };

function subscribeViewport(callback: () => void) {
  const query = window.matchMedia("(max-width: 743px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const smallViewport = () => window.matchMedia("(max-width: 743px)").matches;
const serverViewport = () => false;

export function EditDatesModal({ open, initial, bookedRanges, minNights, maxNights, ready, failed, onRetry, onClose, onSave }: {
  open: boolean; initial: DateRange | undefined; bookedRanges: BookedRange[]; minNights: number; maxNights: number; ready: boolean; failed: boolean; onRetry: () => void; onClose: () => void; onSave: (range: DateRange) => void;
}) {
  const [range, setRange] = useState(initial);
  const compact = useSyncExternalStore(subscribeViewport, smallViewport, serverViewport);
  const error = range?.from && range.to ? validateStay(toDateString(range.from), toDateString(range.to), bookedRanges, { min_nights: minNights, max_nights: maxNights }) : "Select your check-in and checkout dates.";
  return <Modal open={open} onClose={onClose} title="Change dates" presentation="checkout" width={960} footer={<div className={styles.modalActions}>
    <button type="button" className={styles.textButton} onClick={() => setRange(undefined)}>Clear dates</button>
    <button type="button" className={styles.darkButton} disabled={!open || Boolean(error) || !ready} onClick={() => { if (open && range && !error && ready) onSave(range); }}>Save</button>
  </div>}>
    {ready ? <div className={styles.calendar}><DatePicker value={range} onChange={setRange} bookedRanges={bookedRanges} minNights={minNights} maxNights={maxNights} numberOfMonths={compact ? 1 : 2} /></div> : failed ? <div role="alert"><p className={styles.error}>We could not load availability.</p><button type="button" className={styles.textButton} onClick={onRetry}>Try again</button></div> : <div className={`${styles.skeleton} ${styles.sectionSkeleton}`} aria-label="Loading availability" aria-busy="true" />}
    <p className={styles.secondary}>Minimum stay: {minNights} {minNights === 1 ? "night" : "nights"}</p>
    <p className={styles.secondary} aria-live="polite">{error ?? "Your selected dates are available."}</p>
  </Modal>;
}

export function EditGuestsModal({ open, initial, max, onClose, onSave }: {
  open: boolean; initial: TripGuests; max: number; onClose: () => void; onSave: (guests: TripGuests) => void;
}) {
  const [guests, setGuests] = useState(initial);
  return <Modal open={open} onClose={onClose} title="Change guests" presentation="checkout" width={720} footer={<div className={styles.modalActions}><button type="button" className={styles.textButton} onClick={onClose}>Cancel</button><button type="button" className={styles.darkButton} disabled={!open} onClick={() => { if (open) onSave(guests); }}>Save</button></div>}>
    <p className={styles.secondary}>This place has a maximum of {max} guests, not including infants.</p>
    {([
      ["adults", "Adults", "Ages 13 or above", 1, max - guests.children],
      ["children", "Children", "Ages 2-12", 0, max - guests.adults],
      ["infants", "Infants", "Under 2", 0, 5],
      ["pets", "Pets", "Pet policy must be confirmed with the host", 0, 5],
    ] as const).map(([key, label, subtitle, min, limit]) => <div className={styles.guestRow} key={key}>
      <div><strong>{label}</strong><p className={styles.small}>{subtitle}</p></div>
      <Stepper value={guests[key]} min={min} max={limit} label={label.toLowerCase()} onChange={value => setGuests(current => ({ ...current, [key]: value }))} />
    </div>)}
    <p className={styles.secondary}>Infants and pets are not included in the booking record.</p>
    <p className={styles.srOnly} aria-live="polite">{formatGuests(guests)}</p>
  </Modal>;
}
