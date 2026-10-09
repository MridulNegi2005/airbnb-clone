import type { Metadata } from "next";
import { CalendarListings } from "@/components/hosting/calendar/calendar-listings";
export const metadata: Metadata = { title: "Hosting calendars" };
export default function CalendarsPage() { return <CalendarListings />; }
