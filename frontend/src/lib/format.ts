import { parseDate } from "./dates";
export function formatPrice(value: number): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}
export function formatRating(value: number | null): string { return value === null ? "New" : value.toFixed(2); }
export function formatTripDateRange(start: string, end: string): string {
  const from = parseDate(start), to = parseDate(end);
  const sameYear = from.getFullYear() === to.getFullYear();
  const full = (date: Date) => date.toLocaleDateString("en-GB", {day:"numeric",month:"long",year:"numeric"});
  if (!sameYear) return `${full(from)} – ${full(to)}`;
  const month = to.toLocaleDateString("en-GB", {month:"long"});
  if (from.getMonth() === to.getMonth()) return `${from.getDate()}–${to.getDate()} ${month} ${to.getFullYear()}`;
  return `${from.getDate()} ${from.toLocaleDateString("en-GB", {month:"long"})} – ${to.getDate()} ${month} ${to.getFullYear()}`;
}
export function plural(value: number, word: string, pluralWord = `${word}s`): string { return `${value} ${value === 1 ? word : pluralWord}`; }
export function formatDateRange(start: string | Date, end: string | Date): string {
  const from = typeof start === "string" ? parseDate(start) : start;
  const to = typeof end === "string" ? parseDate(end) : end;
  const differentYear = from.getFullYear() !== to.getFullYear();
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", ...(differentYear ? {year: "numeric"} : {}) };
  return `${from.toLocaleDateString("en-US", options)} - ${from.getMonth() === to.getMonth() && !differentYear ? to.getDate() : to.toLocaleDateString("en-US", options)}`;
}
export function formatLongDate(value: string | Date): string { return (typeof value === "string" ? parseDate(value) : value).toLocaleDateString("en-US", {weekday: "short", month: "short", day: "numeric"}); }
export function formatMonthYear(value: string | Date): string { return (typeof value === "string" ? parseDate(value) : value).toLocaleDateString("en-US", {month: "long", year: "numeric"}); }
export function formatGuests(guests: {adults: number; children: number; infants: number; pets: number}): string {
  return [plural(guests.adults + guests.children, "guest"), guests.infants ? plural(guests.infants, "infant") : "", guests.pets ? plural(guests.pets, "pet") : ""].filter(Boolean).join(", ");
}
