"use client";

import { ChevronDown, ChevronUp, Flag } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DateRange } from "react-day-picker";
import { DatePicker } from "@/components/calendar/date-picker";
import { GradientButton } from "@/components/ui/gradient-button";
import { Modal } from "@/components/ui/modal";
import { Stepper } from "@/components/ui/stepper";
import { formatDateRange, formatPrice, plural } from "@/lib/format";
import { countNights, parseDate, toDateString, validateStay } from "@/lib/dates";
import type { BookedRange, ListingDetail, PriceQuote } from "@/types/api";
import styles from "./detail.module.css";

export type StayRange = DateRange;
export type GuestSelection = { adults: number; children: number; infants: number; pets: number };
type Props = {
  listing: ListingDetail; range: StayRange | undefined; onRangeChange: (range: StayRange | undefined) => void;
  guests: GuestSelection; onGuestsChange: (guests: GuestSelection) => void;
  bookedRanges: BookedRange[]; quote: PriceQuote | undefined;
  availabilityLoading: boolean; availabilityError: boolean; quoteLoading: boolean; quoteError: string | null;
  onRetry: () => void; onReserve: () => void; reserving: boolean;
};

function subscribeDesktop(callback: () => void) {
  const query = window.matchMedia("(min-width: 950px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function DateEntry({ label, date, onCommit }: { label: string; date?: Date; onCommit: (date: Date | undefined) => void }) {
  const value = date?.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) ?? "";
  return <label><span>{label.toUpperCase()}</span><input key={value} aria-label={`${label} date`} placeholder="DD/MM/YYYY" inputMode="numeric" defaultValue={value} onBlur={(event) => {
    const text = event.currentTarget.value.trim();
    if (!text) { onCommit(undefined); return; }
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (!match) { event.currentTarget.value = value; return; }
    const [, day, month, year] = match;
    if (!day || !month || !year) return;
    const key = `${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`;
    const parsed = parseDate(key);
    if (toDateString(parsed) !== key) { event.currentTarget.value = value; return; }
    onCommit(parsed);
  }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></label>;
}

export function StaySelector({ listing, range, onRangeChange, guests, onGuestsChange, bookedRanges, quote, availabilityLoading, availabilityError, quoteLoading, quoteError, onRetry, onReserve, reserving }: Props) {
  const [datesOpen, setDatesOpen] = useState(false);
  const [guestsOpen, setGuestsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [dateEntryError, setDateEntryError] = useState<string | null>(null);
  const datePanel = useRef<HTMLDivElement>(null);
  const dateTrigger = useRef<HTMLElement | null>(null);
  const guestPanel = useRef<HTMLDivElement>(null);
  const guestTrigger = useRef<HTMLButtonElement>(null);
  const desktop = useSyncExternalStore(subscribeDesktop, () => window.matchMedia("(min-width: 950px)").matches, () => false);
  const guestCount = guests.adults + guests.children;
  const hasDates = Boolean(range?.from && range.to);
  const disabled = availabilityLoading || availabilityError || reserving || (hasDates && (quoteLoading || !quote || !quote.available || Boolean(quoteError)));
  const calendarTitle = range?.from ? range.to ? `${countNights(toDateString(range.from), toDateString(range.to))} nights in ${listing.city}` : "Select checkout date" : "Select check-in date";

  useEffect(() => {
    if (!datesOpen || !desktop) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dateTrigger.current = opener;
    const frame = requestAnimationFrame(() => datePanel.current?.querySelector<HTMLInputElement>("input")?.focus());
    function close() { setDatesOpen(false); dateTrigger.current?.focus(); }
    function outside(event: MouseEvent) { if (event.target instanceof Node && !datePanel.current?.contains(event.target)) close(); }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const controls = Array.from(datePanel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("mousedown", outside); document.addEventListener("keydown", keydown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", keydown); };
  }, [datesOpen, desktop]);

  useEffect(() => {
    if (!guestsOpen || !desktop) return;
    const opener = guestTrigger.current;
    const frame = requestAnimationFrame(() => guestPanel.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
    const close = () => { setGuestsOpen(false); opener?.focus(); };
    function outside(event: MouseEvent) { if (event.target instanceof Node && !guestPanel.current?.contains(event.target) && !opener?.contains(event.target)) close(); }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key === "Tab") {
        const controls = Array.from(guestPanel.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("mousedown", outside); document.addEventListener("keydown", keydown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("mousedown", outside); document.removeEventListener("keydown", keydown); };
  }, [guestsOpen, desktop]);

  function reserve() {
    if (!hasDates) setDatesOpen(true);
    else onReserve();
  }

  function enterDate(date: Date | undefined, checkout: boolean) {
    setDateEntryError(null);
    if (!date) { onRangeChange(checkout && range?.from ? { from: range.from } : undefined); return; }
    if (toDateString(date) < toDateString(new Date())) { setDateEntryError("Choose today or a later date."); return; }
    const next = checkout ? { from: range?.from, to: date } : { from: date, to: range?.to && range.to > date ? range.to : undefined };
    if (next.from && next.to) {
      const nights = countNights(toDateString(next.from),toDateString(next.to));
      const error = validateStay(toDateString(next.from),toDateString(next.to),bookedRanges) ?? (nights < listing.min_nights ? `Minimum stay: ${plural(listing.min_nights,"night")}` : nights > listing.max_nights ? `Maximum stay: ${plural(listing.max_nights,"night")}` : null);
      if (error) { setDateEntryError(error); return; }
    }
    if (next.from) onRangeChange(next);
    else setDateEntryError("Choose a check-in date first.");
  }

  const price = <><strong>{formatPrice(quote ? quote.subtotal - quote.discount : listing.price_per_night)}</strong><span>{quote ? ` for ${plural(quote.nights, "night")}` : " night"}</span></>;
  const guestRows = <div className={styles.guestRows}>
    <div><span><strong>Adults</strong><small>Age 13+</small></span><Stepper label="adults" value={guests.adults} min={1} max={listing.max_guests - guests.children} onChange={(adults) => onGuestsChange({ ...guests, adults })} /></div>
    <div><span><strong>Children</strong><small>Ages 2–12</small></span><Stepper label="children" value={guests.children} min={0} max={listing.max_guests - guests.adults} onChange={(children) => onGuestsChange({ ...guests, children })} /></div>
    <div><span><strong>Infants</strong><small>Under 2</small></span><Stepper label="infants" value={guests.infants} min={0} max={5} onChange={(infants) => onGuestsChange({ ...guests, infants })} /></div>
    <div><span><strong>Pets</strong><small>Confirm suitability with the host</small></span><Stepper label="pets" value={guests.pets} min={0} max={5} onChange={(pets) => onGuestsChange({ ...guests, pets })} /></div>
    <p>This place has a maximum of {plural(listing.max_guests, "guest")}, not including infants.</p>
  </div>;
  return <>
    <aside className={styles.bookingAside} aria-label="Reservation">
      <div className={styles.bookingCard}>
        <div className={styles.bookingPrice}>{hasDates ? price : <strong>Add dates for prices</strong>}</div>
        <div className={styles.pickerBox}>
          <div className={styles.dateCells}><button onClick={() => setDatesOpen(true)} aria-label="Choose check-in date"><span>CHECK-IN</span>{range?.from ? range.from.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Add date"}</button><button onClick={() => setDatesOpen(true)} aria-label="Choose checkout date"><span>CHECKOUT</span>{range?.to ? range.to.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }) : "Add date"}</button></div>
          <button ref={guestTrigger} className={styles.guestCell} onClick={() => { setDatesOpen(false); setGuestsOpen(!guestsOpen); }} aria-haspopup="dialog" aria-expanded={guestsOpen}><span><strong>GUESTS</strong>{plural(guestCount, "guest")}{guests.infants > 0 ? `, ${plural(guests.infants, "infant")}` : ""}</span>{guestsOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}</button>
        </div>
        {guestsOpen && desktop && <div className={styles.guestPopover} ref={guestPanel} role="dialog" aria-label="Guests">{guestRows}<button className={styles.textButton} onClick={() => { setGuestsOpen(false); guestTrigger.current?.focus(); }}>Close</button></div>}
        {datesOpen && desktop && <div className={styles.datePopover} ref={datePanel} role="dialog" aria-label="Choose your travel dates"><div className={styles.popoverHeading}><div><h2>{hasDates ? calendarTitle : "Select dates"}</h2><p>{range?.from && range.to ? formatDateRange(range.from, range.to) : "Add your travel dates for exact pricing"}</p></div><div className={styles.popoverDateFields}><DateEntry label="Check-in" date={range?.from} onCommit={(date)=>enterDate(date,false)}/><DateEntry label="Checkout" date={range?.to} onCommit={(date)=>enterDate(date,true)}/></div></div>{dateEntryError && <p className={styles.inlineError} role="alert">{dateEntryError}</p>}{availabilityError ? <p className={styles.inlineError}>We could not load availability. <button onClick={onRetry}>Try again</button></p> : availabilityLoading ? <div className={`${styles.skeleton} ${styles.calendarSkeleton}`} /> : <DatePicker minNights={listing.min_nights} maxNights={listing.max_nights} value={range} onChange={onRangeChange} bookedRanges={bookedRanges} numberOfMonths={2} />}<p className={styles.minimumStay}>Minimum stay: {plural(listing.min_nights, "night")}</p><div className={styles.calendarActions}><button className={styles.textButton} onClick={() => onRangeChange(undefined)}>Clear dates</button><button className={styles.darkButton} onClick={() => { setDatesOpen(false); dateTrigger.current?.focus(); }}>Close</button></div></div>}
        {availabilityError && <p className={styles.inlineError}>We could not load availability. <button onClick={onRetry}>Try again</button></p>}
        {quoteError && <p className={styles.inlineError} role="alert">{quoteError}</p>}
        {quote && !quote.available && <p className={styles.inlineError} role="alert">These dates are unavailable. Choose another stay.</p>}
        <GradientButton className={styles.reserveButton} onClick={reserve} disabled={disabled}>{reserving ? "Checking availability..." : quoteLoading && hasDates ? "Updating price..." : hasDates ? "Reserve" : "Check availability"}</GradientButton>
        {hasDates && <p className={styles.chargeNote}>You won&apos;t be charged yet</p>}
        {quote?.available && <div className={styles.priceBreakdown}><div><span>{formatPrice(quote.nightly_rate)} x {plural(quote.nights, "night")}</span><span>{formatPrice(quote.subtotal)}</span></div>{quote.discount > 0 && <div className={styles.discount}><span>Weekly stay discount</span><span>-{formatPrice(quote.discount)}</span></div>}{quote.cleaning_fee > 0 && <div><span>Cleaning fee</span><span>{formatPrice(quote.cleaning_fee)}</span></div>}<div><span>Airbnb service fee</span><span>{formatPrice(quote.service_fee)}</span></div><div className={styles.priceTotal}><strong>Total before taxes</strong><strong>{formatPrice(quote.total)}</strong></div></div>}
      </div>
      <button className={styles.report} onClick={() => setReportOpen(true)}><Flag size={16} aria-hidden="true" />Report this listing</button>
    </aside>
    <div className={styles.mobileReserve}><div><div>{hasDates ? price : <strong>Add dates for prices</strong>}</div><button onClick={() => setDatesOpen(true)}>{range?.from && range.to ? formatDateRange(range.from, range.to) : listing.rating !== null ? `★ ${listing.rating.toFixed(2)}` : "Add dates"}</button>{quoteError && <span className={styles.inlineError}>Check your dates</span>}</div><GradientButton onClick={reserve} disabled={disabled}>{reserving ? "Checking..." : hasDates ? "Reserve" : "Check availability"}</GradientButton></div>
    <Modal open={datesOpen && !desktop} onClose={() => setDatesOpen(false)} title={calendarTitle} presentation="calendar" width={720} footer={<div className={styles.calendarSave}><div><strong>{hasDates ? price : "Add dates for prices"}</strong>{listing.rating !== null && <small>★ {listing.rating.toFixed(2)}</small>}</div><button disabled={!hasDates || Boolean(quoteError)} className={styles.saveDates} onClick={()=>setDatesOpen(false)}>Save</button></div>}>
      <div className={styles.mobileCalendar}><button className={styles.clearMobileDates} onClick={()=>onRangeChange(undefined)}>Clear dates</button><div className={styles.mobileCalendarHeading}><h2>{calendarTitle}</h2><p>{range?.from && range.to ? formatDateRange(range.from,range.to) : "Add your travel dates for exact pricing"}</p><div className={styles.weekdayHeader} aria-hidden="true">{["S","M","T","W","T","F","S"].map((day,index)=><span key={index}>{day}</span>)}</div></div><div className={styles.mobileCalendarMonths}>{availabilityError ? <p className={styles.inlineError}>We could not load availability. <button onClick={onRetry}>Try again</button></p> : availabilityLoading ? <div className={`${styles.skeleton} ${styles.calendarSkeleton}`}/> : <DatePicker value={range} onChange={onRangeChange} bookedRanges={bookedRanges} minNights={listing.min_nights} maxNights={listing.max_nights} numberOfMonths={12} hideNavigation hideWeekdays/>}<p className={styles.minimumStay}>Minimum stay: {plural(listing.min_nights,"night")}</p></div></div>
    </Modal>
    <Modal open={guestsOpen && !desktop} onClose={() => setGuestsOpen(false)} title="Guests" footer={<button className={styles.darkButton} onClick={() => setGuestsOpen(false)}>Close</button>}>{guestRows}</Modal>
    <Modal open={reportOpen} onClose={() => setReportOpen(false)} title="Report this listing"><div className={styles.modalPadding}><h2>Reporting is coming soon</h2><p>This demo does not send listing reports.</p></div></Modal>
  </>;
}
