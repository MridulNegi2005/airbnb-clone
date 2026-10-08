import type { ListingCard, MapBounds } from "@/types/api";

export type LocationMapProps = { latitude: number | null; longitude: number | null; neighbourhood?: string; label?: string };
export type ExploreMapProps = {
  listings: ListingCard[];
  bounds?: MapBounds;
  onBoundsChange?: (bounds: MapBounds) => void;
  hoveredListingId?: number | null;
  onHoverListing?: (id: number | null) => void;
  searchParams?: string;
};
export type HostAddressValue = {
  address: string; neighbourhood: string; city: string; country: string;
  latitude: number | null; longitude: number | null; google_place_id: string | null;
};
export type HostAddressPickerProps = { value: HostAddressValue; onChange: (value: HostAddressValue) => void; disabled?: boolean; searchOnly?: boolean; placeholder?: string };
