import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError, getListing, getReviews } from "@/lib/api";
import { ListingDetailView } from "@/components/listing-detail/listing-detail-view";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return { title: "Listing not found - Airbnb clone" };
  try {
    const listing = await getListing(Number(id));
    return { title: { absolute: `${listing.title} - Airbnb clone` }, description: listing.description.slice(0, 160) };
  } catch {
    return { title: "Stay details - Airbnb clone" };
  }
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  if (!/^\d+$/.test(id) || Number(id) < 1) notFound();
  const listing = await getListing(Number(id)).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const reviews = await getReviews(listing.id);
  return <ListingDetailView listing={listing} initialReviews={reviews} />;
}
