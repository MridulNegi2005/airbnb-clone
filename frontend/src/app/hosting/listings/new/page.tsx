import type { Metadata } from 'next';
import { ListingForm } from '@/components/hosting/listing-form/listing-form';
export const metadata: Metadata = { title: 'Airbnb your home - Airbnb clone' };
export default function NewListingPage() { return <ListingForm />; }
