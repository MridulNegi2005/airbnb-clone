import type { Metadata } from "next";
import { CalendarListings } from "@/components/hosting/calendar/calendar-listings";
export const metadata: Metadata = { title: "Hosting calendars | Airbnb clone" };
export default function CalendarsPage() { return <CalendarListings />; }
