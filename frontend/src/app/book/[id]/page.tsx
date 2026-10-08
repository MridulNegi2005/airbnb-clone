import { Suspense } from "react";
import { CheckoutClient } from "@/components/booking/checkout-client";
import { CheckoutSkeleton } from "@/components/booking/checkout-skeleton";

export const metadata = { title: "Confirm and pay" };

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Suspense fallback={<CheckoutSkeleton />}><CheckoutClient id={Number(id)} /></Suspense>;
}
