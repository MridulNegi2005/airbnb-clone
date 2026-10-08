import { Suspense } from "react";
import { notFound } from "next/navigation";
import { CheckoutClient } from "@/components/booking/checkout-client";
import { CheckoutSkeleton } from "@/components/booking/checkout-skeleton";

export const metadata = { title: "Confirm and pay" };

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listingId=Number(id);
  if(!/^\d+$/.test(id)||!Number.isSafeInteger(listingId)||listingId<1)notFound();
  return <Suspense fallback={<CheckoutSkeleton />}><CheckoutClient id={listingId} /></Suspense>;
}
