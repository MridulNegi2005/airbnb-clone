import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { HostCalendar } from "@/components/hosting/calendar/host-calendar";
export const metadata: Metadata = { title: "Hosting calendar" };
export default async function HostCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId = Number(id);
  if (!Number.isInteger(listingId) || listingId < 1) notFound();
  return <main id="main-content"><HostCalendar listingId={listingId} /></main>;
}
