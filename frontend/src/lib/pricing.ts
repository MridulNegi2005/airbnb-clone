import { countNights } from "./dates";
export function nightlySubtotal(rate: number, checkIn: string, checkOut: string): number { return rate * countNights(checkIn, checkOut); }
