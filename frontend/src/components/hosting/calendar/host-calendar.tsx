"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, LockKeyhole, CalendarDays, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { ApiError, blockDates, getBlockedDates, getHostBookings, getHostListing, queryKeys, unblockDates } from "@/lib/api";
import { parseDate, toDateString } from "@/lib/dates";
import { formatPrice, plural } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { Modal } from "@/components/ui/modal";
import styles from "./host-calendar.module.css";

type Selection = { start: string; end: string };
function nextDate(value: string, count = 1) { const date = parseDate(value); date.setDate(date.getDate() + count); return toDateString(date); }
function range(a: string, b: string): Selection { return { start: a < b ? a : b, end: a < b ? b : a }; }
function longDate(value: string) { return parseDate(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function nightCount(selection: Selection) { return Math.round((Date.UTC(...dateParts(selection.end)) - Date.UTC(...dateParts(selection.start))) / 86400000) + 1; }
function dateParts(value: string): [number, number, number] { const date = parseDate(value); return [date.getFullYear(), date.getMonth(), date.getDate()]; }

export function HostCalendar({ listingId }: { listingId: number }) {
  const { user, status, openAuth } = useAuth();
  const client = useQueryClient(), cooldown = useApiCooldown();
  const [month, setMonth] = useState(() => { const date = new Date(); return new Date(date.getFullYear(), date.getMonth(), 1); });
  const [selection, setSelection] = useState<Selection | null>(null), [anchor, setAnchor] = useState<string | null>(null), [openConfirm, setOpenConfirm] = useState(false);
  const drag = useRef<{ start: string; moved: boolean } | null>(null), ignoreClick = useRef(false), authPrompted = useRef(false);
  const enabled = status === "authenticated";
  const listing = useQuery({ queryKey: [...queryKeys.hostListing(listingId), user?.id], queryFn: ({ signal }) => getHostListing(listingId, signal), enabled });
  const periods = useQuery({ queryKey: [...queryKeys.blockedDates(listingId), user?.id], queryFn: ({ signal }) => getBlockedDates(listingId, signal), enabled: enabled && listing.isSuccess });
  const bookings = useQuery({ queryKey: [...queryKeys.hostBookings, listingId, user?.id], queryFn: ({ signal }) => getHostBookings(listingId, signal), enabled: enabled && listing.isSuccess });
  useEffect(() => { if (status === "anonymous" && !authPrompted.current) { authPrompted.current = true; openAuth(); } }, [status, openAuth]);
  async function refreshed() { await Promise.all([client.invalidateQueries({ queryKey: queryKeys.blockedDates(listingId) }), client.invalidateQueries({ queryKey: queryKeys.bookedDates(listingId) }), client.invalidateQueries({ queryKey: ["quote", listingId] }), client.invalidateQueries({ queryKey: ["listings"] })]); }
  const change = useMutation({ mutationFn: async (action: { type: "block"; selected: Selection } | { type: "open"; ids: number[] }) => { if (action.type === "block") await blockDates(listingId, { start_date: action.selected.start, end_date: nextDate(action.selected.end) }); else for (const id of action.ids) await unblockDates(listingId, id); }, onSuccess: async (_data, action) => { toast(action.type === "block" ? "Nights blocked" : "Nights opened"); setOpenConfirm(false); setSelection(null); setAnchor(null); await refreshed(); }, onError: async error => { cooldown.record(error); void refreshed(); toast.error(error.message); } });
  const today = toDateString(new Date());
  const confirmed = (bookings.data ?? []).filter(booking => booking.status === "confirmed");
  const blocked = periods.data ?? [];
  const selectedPeriods = selection ? blocked.filter(period => period.start_date <= selection.end && period.end_date > selection.start) : [];
  const selectedBookings = selection ? confirmed.filter(booking => booking.check_in <= selection.end && booking.check_out > selection.start) : [];
  const selectedNights = selection ? nightCount(selection) : 0;
  const canBlock = !!selection && selection.start >= today && selectedNights <= 365 && !selectedBookings.length && !selectedPeriods.length;
  const locked = change.isPending || cooldown.blocked;
  function select(date: string) { if (locked) return; change.reset(); if (ignoreClick.current) { ignoreClick.current = false; return; } if (anchor) { setSelection(range(anchor, date)); setAnchor(null); } else { setSelection({ start: date, end: date }); setAnchor(date); } }
  function clear() { setSelection(null); setAnchor(null); change.reset(); }
  function moveMonth(delta: number) { setMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1)); }
  const first = new Date(month.getFullYear(), month.getMonth(), 1), last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const offset = (first.getDay() + 6) % 7;
  const cells = Array.from({ length: Math.ceil((offset + last.getDate()) / 7) * 7 }, (_, index) => { const date = new Date(first); date.setDate(index - offset + 1); return { value: toDateString(date), date, current: date.getMonth() === month.getMonth() }; });
  const error = listing.error ?? periods.error ?? bookings.error;
  if (status === "anonymous") return <div className={styles.gate}><CalendarDays size={48} aria-hidden="true" /><h1>Log in to manage your calendar</h1><p>Set availability for your listing and view upcoming guests.</p><button className="dark-button" onClick={() => openAuth()}>Log in</button></div>;
  if (error) return <div className={styles.gate}><h1>{error instanceof ApiError && [403, 404].includes(error.status) ? "This calendar is not available" : "Could not load your calendar"}</h1><p role="alert">{error.message}</p><Link href="/hosting" className="text-button">Back to hosting</Link><button className="outline-button" onClick={() => { void listing.refetch(); void periods.refetch(); void bookings.refetch(); }}>Try again</button></div>;
  const loading = status === "loading" || listing.isPending || periods.isPending || bookings.isPending;
  return <div className={styles.page}>
    <header className={styles.pageHeading}><div><Link href="/hosting/calendar" className={styles.back}><ChevronLeft size={18} aria-hidden="true" />All listings</Link><h1>Calendar</h1><p>{listing.data?.title ?? "Your listing"}</p></div><Link href={`/hosting/listings/${listingId}/edit`} className="outline-button">Listing settings</Link></header>
    <div className={styles.workspace} aria-busy={loading}>
      <section className={styles.calendar} aria-label="Listing availability">
        <div className={styles.monthBar}><h2 aria-live="polite">{month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2><div><button className={styles.today} onClick={() => { const now = new Date(); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); }}>Today</button><button className={styles.arrow} aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft size={20} /></button><button className={styles.arrow} aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight size={20} /></button></div></div>
        <p className={styles.instruction}>Select dates to manage availability.</p>
        {loading ? <div className={`${styles.loadingGrid} skeleton`} aria-label="Loading calendar" /> : <div className={styles.grid} role="grid" aria-label={`${month.toLocaleDateString("en-IN", { month: "long", year: "numeric" })} availability`} onPointerUp={() => { if (drag.current?.moved) { ignoreClick.current = true; setAnchor(null); } drag.current = null; }} onPointerLeave={() => { if (drag.current?.moved) { ignoreClick.current = true; setAnchor(null); } drag.current = null; }}>
          <div className={styles.weekdays} role="row">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => <span key={day} role="columnheader">{day}</span>)}</div>
          {Array.from({ length: cells.length / 7 }, (_, week) => <div key={week} className={styles.week} role="row">{cells.slice(week * 7, week * 7 + 7).map(({ value, date, current }) => { const booking = confirmed.find(item => item.check_in <= value && item.check_out > value), period = blocked.find(item => item.start_date <= value && item.end_date > value), selected = !!selection && value >= selection.start && value <= selection.end, past = value < today; return <div key={value} role="gridcell" aria-selected={selected}><button id={`host-day-${value}`} type="button" disabled={locked || past} className={`${styles.day} ${!current ? styles.otherMonth : ""} ${booking ? styles.booked : period ? styles.blocked : ""} ${selected ? styles.selected : ""} ${value === today ? styles.currentDay : ""}`} aria-label={`${longDate(value)}, ${booking ? `booked by ${booking.guest.name}` : period ? "blocked" : "open"}, ${formatPrice(listing.data?.price_per_night ?? 0)}${selected ? ", selected" : ""}`} onClick={() => select(value)} onPointerDown={event => { if (event.button === 0 && event.pointerType === "mouse" && !locked && !past) { ignoreClick.current = false; drag.current = { start: value, moved: false }; } }} onPointerEnter={event => { if (drag.current && event.buttons === 1 && !past && !locked) { drag.current.moved = value !== drag.current.start; setSelection(range(drag.current.start, value)); } }} onKeyDown={event => { if (event.key === "Escape") { clear(); return; } const days = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : event.key === "ArrowDown" ? 7 : event.key === "ArrowUp" ? -7 : 0; if (!days) return; event.preventDefault(); const target = nextDate(value, days); document.getElementById(`host-day-${target}`)?.focus(); if (event.shiftKey && target >= today) { const start = anchor ?? value; setAnchor(start); setSelection(range(start, target)); } }}><span className={styles.number}>{date.getDate()}</span>{booking ? <><span className={styles.bookingName}>{booking.guest.name.split(" ")[0]}</span><span className={styles.price}>{formatPrice(listing.data?.price_per_night ?? 0)}</span></> : <span className={styles.price}>{period ? <LockKeyhole size={13} aria-hidden="true" /> : null}{formatPrice(listing.data?.price_per_night ?? 0)}</span>}</button></div>; })}</div>)}
        </div>}
        <div className={styles.legend}><span><i className={styles.openKey} />Open</span><span><i className={styles.bookedKey} />Booked</span><span><i className={styles.blockedKey} />Blocked</span></div>
      </section>
      <aside className={styles.panel} aria-labelledby="availability-heading"><h2 id="availability-heading">{selection ? `${longDate(selection.start)}${selection.start !== selection.end ? ` – ${longDate(selection.end)}` : ""}` : "Select dates"}</h2>{selection ? <><p className={styles.panelCaption}>{plural(selectedNights, "night")} selected</p>{selectedBookings.length > 0 ? <div className={styles.reservationInfo}><h3>Reserved nights</h3>{selectedBookings.map(booking => <p key={booking.id}><strong>{booking.guest.name}</strong><br />{longDate(booking.check_in)} – {longDate(booking.check_out)}</p>)}<p>Reserved nights cannot be blocked or opened.</p></div> : <>{selectedPeriods.length ? <p>These dates include blocked nights. Opening removes the entire selected blocked period{selectedPeriods.length > 1 ? "s" : ""}.</p> : <p>Guests can book open nights that fit your trip length settings.</p>}<div className={styles.actions}><button className="dark-button" disabled={locked || !canBlock} onClick={() => { if (selection && canBlock && !locked) change.mutate({ type: "block", selected: selection }); }}>{change.isPending ? <LoaderCircle size={16} className={styles.spin} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}Block nights</button><button className="outline-button" disabled={locked || !selectedPeriods.length} onClick={() => { change.reset(); setOpenConfirm(true); }}>Open nights</button></div>{selectedNights > 365 && <p role="alert" className="error-text">Select no more than 365 nights.</p>}{cooldown.blocked && <p className="error-text" role="status">Please wait before changing availability again.</p>}{change.isError && <p role="alert" className="error-text">{change.error.message}</p>}</>}<button className="text-button" disabled={change.isPending} onClick={clear}>Clear selection</button></> : <><p className={styles.panelCaption}>Click a start and end date, or drag across nights.</p><div className={styles.settings}><h3>Pricing</h3><p>{formatPrice(listing.data?.price_per_night ?? 0)} per night</p><h3>Trip length</h3><p>{listing.data?.min_nights ?? 1} night minimum · {listing.data?.max_nights ?? 365} night maximum</p><h3>Weekly discount</h3><p>{listing.data?.weekly_discount_percent ?? 0}% for 7 nights or more</p><Link className="text-button" href={`/hosting/listings/${listingId}/edit`}>Edit listing settings</Link></div></>}</aside>
    </div>
    <Modal open={openConfirm} onClose={() => { if (!change.isPending) setOpenConfirm(false); }} title="Open these nights?" footer={<><button className="text-button" disabled={change.isPending} onClick={() => setOpenConfirm(false)}>Cancel</button><button className="dark-button" disabled={locked || !selectedPeriods.length} onClick={() => change.mutate({ type: "open", ids: selectedPeriods.map(period => period.id) })}>{change.isPending ? "Opening…" : "Open nights"}</button></>}><div className={styles.confirm}><p>Guests will be able to book all nights in these blocked periods:</p><ul>{selectedPeriods.map(period => <li key={period.id}>{longDate(period.start_date)} – {longDate(nextDate(period.end_date, -1))}</li>)}</ul>{change.isError && <p role="alert" className="error-text">{change.error.message}</p>}</div></Modal>
  </div>;
}
