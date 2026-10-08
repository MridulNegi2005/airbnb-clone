import type { BookedRange } from "@/types/api";

export function toDateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseDate(value: string): Date {
  const [year = 0, month = 1, day = 1] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDate(value).getTime()) && toDateString(parseDate(value)) === value;
}
export function countNights(checkIn: string, checkOut: string): number {
  const from = parseDate(checkIn), to = parseDate(checkOut);
  return (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86_400_000;
}
export function blockedNights(ranges: BookedRange[]): Set<string> {
  const nights = new Set<string>();
  for (const range of ranges) {
    const day = parseDate(range.check_in);
    while (toDateString(day) < range.check_out) { nights.add(toDateString(day)); day.setDate(day.getDate() + 1); }
  }
  return nights;
}
export function validateStay(checkIn: string, checkOut: string, bookedRanges: BookedRange[] = [], limits?: { min_nights: number; max_nights: number }): string | null {
  if (!validDate(checkIn) || !validDate(checkOut)) return "Choose valid check-in and checkout dates.";
  if (checkIn < toDateString(new Date())) return "Check-in cannot be in the past.";
  const nights = countNights(checkIn, checkOut);
  if (nights < 1 || nights > 365) return "Choose a stay between 1 and 365 nights.";
  if (limits && nights < limits.min_nights) return `Minimum stay: ${limits.min_nights} ${limits.min_nights === 1 ? "night" : "nights"}.`;
  if (limits && nights > limits.max_nights) return `Maximum stay: ${limits.max_nights} ${limits.max_nights === 1 ? "night" : "nights"}.`;
  if (bookedRanges.some((range) => checkIn < range.check_out && checkOut > range.check_in)) return "Those dates are no longer available.";
  return null;
}
