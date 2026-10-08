export type Page<T> = { items: T[]; total: number; page: number; page_size: number; has_more: boolean };
export type PropertyType = "house" | "apartment" | "guesthouse" | "hotel";
export type RoomType = "entire_home" | "private_room" | "shared_room"; // UI: "Entire home" | "Room" | "Shared room"
export type BookingStatus = "confirmed" | "cancelled";

export type UserPublic = {
  id: number; name: string; avatar_url: string | null; about: string | null;
  is_superhost: boolean; is_identity_verified: boolean; created_at: string;
};
export type UserPrivate = UserPublic & {
  email: string; work: string | null; languages: string[]; lives_in: string | null;
  has_password: boolean; has_google: boolean;
};
export type PublicProfile = UserPublic & {
  work: string | null; languages: string[]; lives_in: string | null;
  listing_count: number; host_review_count: number; host_rating: number | null; guest_review_count: number;
};
export type AuthResponse = { access_token: string; token_type: "bearer"; user: UserPrivate };

export type Amenity = { id: number; name: string; icon: string };              // icon key, e.g. "wifi", "pool", "hot-tub"
export type Category = { id: number; slug: string; name: string; icon: string }; // e.g. "cabins", icon "cabin"
export type MapBounds = { south: number; west: number; north: number; east: number };

export type ListingCard = {
  id: number; title: string; neighbourhood: string; city: string; country: string;
  property_type: PropertyType; room_type: RoomType; price_per_night: number;
  latitude: number; longitude: number;   // APPROXIMATE (±~330 m)
  image_urls: string[];                  // [0] is the cover
  rating: number | null;                 // null → "New"
  review_count: number;
};
export type ListingDetail = ListingCard & {
  description: string;                   // plain text; "\n\n" between paragraphs; a paragraph may start with a short heading line
  cleaning_fee: number; max_guests: number; bedrooms: number; beds: number; bathrooms: number;
  min_nights: number; max_nights: number; weekly_discount_percent: number;
  amenities: Amenity[]; categories: Category[]; host: UserPublic; created_at: string;
};
export type HostListing = ListingCard & { upcoming_booking_count: number };
export type HostListingDetail = {               // owner only; EXACT location; for the edit form
  id: number; title: string; description: string; property_type: PropertyType; room_type: RoomType;
  address: string; neighbourhood: string; city: string; country: string;
  latitude: number; longitude: number; google_place_id: string | null;
  price_per_night: number; cleaning_fee: number; max_guests: number;
  bedrooms: number; beds: number; bathrooms: number;
  min_nights: number; max_nights: number; weekly_discount_percent: number;
  image_urls: string[]; amenity_ids: number[]; category_ids: number[];
};
export type ListingInput = Omit<HostListingDetail, "id" | "google_place_id" | "cleaning_fee" | "amenity_ids" | "category_ids" | "min_nights" | "max_nights" | "weekly_discount_percent"> & {
  google_place_id?: string | null;       // max 255
  cleaning_fee?: number;                 // 0–100000, default 0
  min_nights?: number;
  max_nights?: number;
  weekly_discount_percent?: number;
  amenity_ids?: number[]; category_ids?: number[];
  // title 1–120, description 1–5000, address 1–200, neighbourhood/city/country 1–100,
  // latitude/longitude inside the service area, price_per_night 1–1000000, max_guests 1–16,
  // bedrooms 0–50, beds 1–50, bathrooms 0–50 in steps of 0.5,
  // image_urls 1–20 https URLs (or our own upload URLs) in display order
};

export type BookedRange = { check_in: string; check_out: string };
export type BlockedPeriod = { id: number; start_date: string; end_date: string };
export type PriceQuote = {
  nights: number; nightly_rate: number; subtotal: number;
  discount: number;
  cleaning_fee: number; service_fee: number; total: number; available: boolean;
};

export type BookingListing = {                  // EXACT location: only people on the booking see this
  id: number; title: string; address: string; neighbourhood: string; city: string; country: string;
  latitude: number; longitude: number; property_type: PropertyType; room_type: RoomType;
  cover_image_url: string | null; host: UserPublic;
};
export type Booking = {
  id: number; check_in: string; check_out: string; nights: number; guests: number;
  nightly_rate: number; subtotal: number; discount: number; cleaning_fee: number; service_fee: number; total: number;
  status: BookingStatus; cancelled_at: string | null;
  has_review: boolean;                   // guest reviewed the stay
  has_guest_review: boolean;             // host reviewed the guest
  created_at: string; listing: BookingListing;
};
export type HostBooking = Booking & { guest: UserPublic };

export type ListingReviewInput = {
  rating: number; cleanliness: number; accuracy: number; check_in: number;
  communication: number; location: number; value: number;  // integers 1–5
  comment: string;                                          // 1–2000
};
export type ListingReview = ListingReviewInput & { id: number; created_at: string; author: UserPublic };
export type GuestReviewInput = { rating: number; comment: string };
export type GuestReview = GuestReviewInput & { id: number; created_at: string; author: UserPublic };
export type RatingSummary = {
  count: number; rating: number | null; cleanliness: number | null; accuracy: number | null;
  check_in: number | null; communication: number | null; location: number | null; value: number | null;
};
export type ReviewPage = Page<ListingReview> & { summary: RatingSummary };
export type ProfileReview = {
  id: number; rating: number; comment: string; created_at: string;
  author: UserPublic; listing: { id: number; title: string };
};

export type WishlistSummary = { id: number; name: string; item_count: number; cover_image_url: string | null; updated_at: string };
export type WishlistDetail = { id: number; name: string; listings: ListingCard[] };
export type SavedListing = { wishlist_id: number; listing_id: number };

export type Message = { id: number; sender_id: number; body: string; created_at: string };
export type ConversationSummary = {
  id: number;
  role: "guest" | "host";                // the current user's role in this thread
  listing: { id: number; title: string; cover_image_url: string | null };
  other_user: UserPublic;
  last_message: Message | null;
  last_message_at: string;
  unread_count: number;
};

export type Upload = { id: number; url: string; width: number; height: number };
export type ProfileUpdate = Partial<{
  name: string;                          // 1–80, cannot be null
  about: string | null;                  // ≤ 1000
  work: string | null;                   // ≤ 120
  languages: string[] | null;            // ≤ 10 items, each ≤ 40
  lives_in: string | null;               // ≤ 120
  avatar_url: string | null;             // https URL or the user's own upload URL
}>;

export type StayParams = { check_in: string; check_out: string; guests: number };
export type BookingInput = StayParams & { listing_id: number };
export type ReviewInput = ListingReviewInput;
export type Review = ListingReview;
export type ListingQuery = {
  location?: string; check_in?: string; check_out?: string; guests?: number;
  min_price?: number; max_price?: number; property_type?: PropertyType[]; room_type?: RoomType;
  amenity?: number[]; category?: string; min_bedrooms?: number; min_beds?: number; min_bathrooms?: number;
  sw_lat?: number; sw_lng?: number; ne_lat?: number; ne_lng?: number; page?: number; page_size?: number;
};
