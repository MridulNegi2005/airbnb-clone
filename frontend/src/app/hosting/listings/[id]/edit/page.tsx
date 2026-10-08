import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListingForm } from '@/components/hosting/listing-form/listing-form';
export const metadata: Metadata = { title: 'Edit your listing - Airbnb clone' };
export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const listingId = Number(id); if (!Number.isInteger(listingId) || listingId < 1) notFound(); return <ListingForm listingId={listingId} />; }
