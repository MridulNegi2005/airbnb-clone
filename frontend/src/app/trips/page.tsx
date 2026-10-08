import { Suspense } from "react";
import type { Metadata } from "next";
import { TripsView, TripsSkeleton } from "@/components/trips/trips-view";

export const metadata: Metadata = { title: "Trips" };

export default function TripsPage() {
  return <Suspense fallback={<TripsSkeleton />}><TripsView /></Suspense>;
}
