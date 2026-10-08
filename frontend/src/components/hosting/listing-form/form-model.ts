import type { HostListingDetail, ListingInput, PropertyType, RoomType } from '@/types/api';

export type Draft = { property_type: PropertyType | ''; room_type: RoomType | ''; address: string; neighbourhood: string; city: string; country: string; latitude: string; longitude: string; google_place_id: string | null; max_guests: number; bedrooms: number; beds: number; bathrooms: number; amenity_ids: number[]; category_ids: number[]; image_urls: string[]; title: string; description: string; price_per_night: number; cleaning_fee: number; min_nights: number; max_nights: number; weekly_discount_percent: number };
export type FormState = { step: number; draft: Draft };
export type Action = { type: 'field'; patch: Partial<Draft> } | { type: 'step'; step: number } | { type: 'restore'; state: FormState };
export const emptyDraft: Draft = { property_type: '', room_type: '', address: '', neighbourhood: '', city: '', country: 'India', latitude: '', longitude: '', google_place_id: null, max_guests: 1, bedrooms: 1, beds: 1, bathrooms: 1, amenity_ids: [], category_ids: [], image_urls: [], title: '', description: '', price_per_night: 6500, cleaning_fee: 0, min_nights: 1, max_nights: 365, weekly_discount_percent: 0 };
export const steps = ["It's easy to get started on Airbnb", 'Which of these best describes your place?', 'What type of place will guests have?', "Where's your place located?", 'Share some basics about your place', 'Tell guests what your place has to offer', 'Add some photos of your place', "Now, let's give your place a title", 'Create your description', 'Now, set your price', 'Review your listing'];
export function reducer(state: FormState, action: Action): FormState {
  if (action.type === 'restore') return action.state;
  if (action.type === 'step') return { ...state, step: action.step };
  return { ...state, draft: { ...state.draft, ...action.patch } };
}
export function stepError(draft: Draft, step: number): string | null {
  if (step === 1 && !draft.property_type) return 'Choose a property type.';
  if (step === 2 && !draft.room_type) return 'Choose a type of place.';
  if (step === 3) {
    if (![draft.address, draft.neighbourhood, draft.city, draft.country].every(value => value.trim())) return 'Add the street address, neighbourhood, city and country.';
    if (draft.address.length > 200 || draft.neighbourhood.length > 100 || draft.city.length > 100 || draft.country.length > 100) return 'Shorten your address to fit the field limits.';
    if (!draft.latitude.trim() || !draft.longitude.trim() || !Number.isFinite(Number(draft.latitude)) || Math.abs(Number(draft.latitude)) > 90 || !Number.isFinite(Number(draft.longitude)) || Math.abs(Number(draft.longitude)) > 180) return 'Choose your location or enter valid latitude (-90 to 90) and longitude (-180 to 180).';
  }
  if (step === 4 && (!Number.isInteger(draft.max_guests) || !Number.isInteger(draft.bedrooms) || !Number.isInteger(draft.beds) || !Number.isInteger(draft.bathrooms * 2) || draft.max_guests < 1 || draft.max_guests > 16 || draft.bedrooms < 0 || draft.bedrooms > 50 || draft.beds < 1 || draft.beds > 50 || draft.bathrooms < 0 || draft.bathrooms > 50)) return 'Check the guest, bedroom, bed and bathroom limits.';
  if (step === 6 && (draft.image_urls.length < 1 || draft.image_urls.length > 20)) return 'Add between 1 and 20 photos.';
  if (step === 7 && (!draft.title.trim() || draft.title.length > 120)) return 'Use a title with 1 to 120 characters.';
  if (step === 8 && (!draft.description.trim() || draft.description.length > 5000)) return 'Use a description with 1 to 5,000 characters.';
  if (step === 9 && (!Number.isInteger(draft.price_per_night) || draft.price_per_night < 1 || draft.price_per_night > 1000000 || !Number.isInteger(draft.cleaning_fee) || draft.cleaning_fee < 0 || draft.cleaning_fee > 100000)) return 'Use a whole-rupee price from ₹1 to ₹10,00,000 and a cleaning fee from ₹0 to ₹1,00,000.';
  if (step === 9 && (!Number.isInteger(draft.weekly_discount_percent) || draft.weekly_discount_percent < 0 || draft.weekly_discount_percent > 90)) return 'Choose a weekly discount from 0 to 90%.';
  if (step === 9 && (!Number.isInteger(draft.min_nights) || !Number.isInteger(draft.max_nights) || draft.min_nights < 1 || draft.max_nights > 365 || draft.max_nights < draft.min_nights)) return 'Choose a minimum and maximum stay of 1 to 365 nights. Maximum nights must be at least the minimum.';
  return null;
}
export function firstInvalid(draft: Draft): number | undefined { return Array.from({ length: 9 }, (_, index) => index + 1).find(step => stepError(draft, step)); }
export function toInput(draft: Draft): ListingInput {
  if (!draft.property_type || !draft.room_type) throw new Error('Choose a property and room type.');
  return { ...draft, property_type: draft.property_type, room_type: draft.room_type, title: draft.title.trim(), description: draft.description.trim(), address: draft.address.trim(), neighbourhood: draft.neighbourhood.trim(), city: draft.city.trim(), country: draft.country.trim(), latitude: Number(draft.latitude), longitude: Number(draft.longitude) };
}
export function fromListing(listing: HostListingDetail): Draft { return { property_type: listing.property_type, room_type: listing.room_type, address: listing.address, neighbourhood: listing.neighbourhood ?? '', city: listing.city, country: listing.country, latitude: String(listing.latitude), longitude: String(listing.longitude), google_place_id: listing.google_place_id ?? null, max_guests: listing.max_guests, bedrooms: listing.bedrooms, beds: listing.beds, bathrooms: listing.bathrooms, amenity_ids: listing.amenity_ids, category_ids: listing.category_ids, image_urls: listing.image_urls, title: listing.title, description: listing.description, price_per_night: listing.price_per_night, cleaning_fee: listing.cleaning_fee, min_nights: listing.min_nights ?? 1, max_nights: listing.max_nights ?? 365, weekly_discount_percent: listing.weekly_discount_percent ?? 0 }; }
export function readDraft(key: string): FormState | null {
  try { const raw: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null'); if (!raw || typeof raw !== 'object' || !('draft' in raw) || !('step' in raw) || typeof raw.step !== 'number' || !Number.isInteger(raw.step) || raw.step < 0 || raw.step > 10 || !raw.draft || typeof raw.draft !== 'object') return null;
    const saved = { min_nights: 1, max_nights: 365, weekly_discount_percent: 0, ...raw.draft } as Record<string, unknown>;
    if (!Object.entries(emptyDraft).every(([field, value]) => field === 'google_place_id' ? saved[field] === null || typeof saved[field] === 'string' : Array.isArray(value) ? Array.isArray(saved[field]) && (saved[field] as unknown[]).every(item => typeof item === (field === 'image_urls' ? 'string' : 'number')) : typeof saved[field] === typeof value)) return null;
    if (raw.step === 0 && Object.entries(emptyDraft).every(([field,value]) => Array.isArray(value) ? JSON.stringify(saved[field]) === JSON.stringify(value) : saved[field] === value)) return null;
    return { step: raw.step, draft: saved as Draft };
  } catch { return null; }
}

