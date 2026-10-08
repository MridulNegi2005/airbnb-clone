import { API_URL } from "./config";
import { clearToken, getToken } from "./auth-storage";
import type * as Api from "@/types/api";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown, public retryAfterSeconds = 0) { super(message); this.name = "ApiError"; }
}
type RequestOptions = { method?: string; body?: unknown; auth?: boolean; signal?: AbortSignal };
async function request<T>(path: string, { method = "GET", body, auth = false, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const isForm = typeof FormData !== "undefined" && body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";
  const requestToken = auth ? getToken() : null;
  if (requestToken) headers.Authorization = `Bearer ${requestToken}`;
  const timeout = AbortSignal.timeout(15_000);
  const response = await fetch(`${API_URL}/api${path}`, { method, headers, body: body === undefined ? undefined : isForm ? body : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: "no-store" });
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => null);
    const detail = error && typeof error === "object" && "detail" in error ? error.detail : null;
    let message = typeof detail === "string" ? detail : `Request failed (${response.status})`;
    if (Array.isArray(detail)) { const first: unknown = detail[0]; if (first && typeof first === "object" && "msg" in first && typeof first.msg === "string") message = first.msg; }
    if (response.status === 401 && requestToken && getToken() === requestToken) { clearToken(); if (typeof window !== "undefined") window.dispatchEvent(new Event("auth-expired")); }
    const retryAfterSeconds = response.status === 429 ? Math.max(1, Number(response.headers.get("Retry-After")) || 60) : 0;
    if (retryAfterSeconds) {
      message = `You're doing that too often. Try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`;
      if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("api-rate-limit", { detail: { seconds: retryAfterSeconds, message } }));
    }
    throw new ApiError(response.status, message, detail, retryAfterSeconds);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
function queryString(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((item: unknown) => query.append(key, String(item)));
    else query.set(key, String(value));
  }
  return query.size ? `?${query}` : "";
}

export const getListings = (params: Api.ListingQuery = {}, signal?: AbortSignal) => request<Api.Page<Api.ListingCard>>(`/listings${queryString(params)}`, { signal });
export const getListing = (id: number, signal?: AbortSignal) => request<Api.ListingDetail>(`/listings/${id}`, { signal });
export const getCategories = (signal?: AbortSignal) => request<Api.Category[]>("/categories", { signal });
export const getAmenities = (signal?: AbortSignal) => request<Api.Amenity[]>("/amenities", { signal });
export const getServiceArea = (signal?: AbortSignal) => request<Api.MapBounds>("/service-area", { signal });
export const getBookedDates = (id: number, signal?: AbortSignal) => request<Api.BookedRange[]>(`/listings/${id}/booked-dates`, { signal });
export const getQuote = (id: number, params: Api.StayParams, signal?: AbortSignal) => request<Api.PriceQuote>(`/listings/${id}/quote${queryString(params)}`, { signal });
export const getReviews = (id: number, page = 1, signal?: AbortSignal) => request<Api.ReviewPage>(`/listings/${id}/reviews?page=${page}&page_size=20`, { signal });
export const createBooking = (body: Api.BookingInput) => request<Api.Booking>("/bookings", { method: "POST", body, auth: true });
export const getBookings = (signal?: AbortSignal) => request<Api.Booking[]>("/bookings", { auth: true, signal });
export const getBooking = (id: number, signal?: AbortSignal) => request<Api.Booking>(`/bookings/${id}`, { auth: true, signal });
export const cancelBooking = (id: number) => request<Api.Booking>(`/bookings/${id}/cancel`, { method: "POST", auth: true });
export const createReview = (id: number, body: Api.ListingReviewInput) => request<Api.ListingReview>(`/bookings/${id}/review`, { method: "POST", body, auth: true });
export const createGuestReview = (id: number, body: Api.GuestReviewInput) => request<Api.GuestReview>(`/bookings/${id}/guest-review`, { method: "POST", body, auth: true });
export const getWishlists = (signal?: AbortSignal) => request<Api.WishlistSummary[]>("/wishlists", { auth: true, signal });
export const getSavedListings = (signal?: AbortSignal) => request<Api.SavedListing[]>("/wishlists/saved", { auth: true, signal });
export const getWishlist = (id: number, signal?: AbortSignal) => request<Api.WishlistDetail>(`/wishlists/${id}`, { auth: true, signal });
export const createWishlist = (body: { name: string }) => request<Api.WishlistDetail>("/wishlists", { method: "POST", body, auth: true });
export const renameWishlist = (id: number, body: { name: string }) => request<Api.WishlistDetail>(`/wishlists/${id}`, { method: "PATCH", body, auth: true });
export const deleteWishlist = (id: number) => request<void>(`/wishlists/${id}`, { method: "DELETE", auth: true });
export const saveWishlist = (id: number, listingId: number) => request<void>(`/wishlists/${id}/listings/${listingId}`, { method: "PUT", auth: true });
export const removeWishlist = (id: number, listingId: number) => request<void>(`/wishlists/${id}/listings/${listingId}`, { method: "DELETE", auth: true });
export const getHostListings = (signal?: AbortSignal) => request<Api.HostListing[]>("/host/listings", { auth: true, signal });
export const getHostListing = (id: number, signal?: AbortSignal) => request<Api.HostListingDetail>(`/host/listings/${id}`, { auth: true, signal });
export const getBlockedDates = (id: number, signal?: AbortSignal) => request<Api.BlockedPeriod[]>(`/host/listings/${id}/blocked-dates`, { auth: true, signal });
export const blockDates = (id: number, body: { start_date: string; end_date: string }) => request<Api.BlockedPeriod>(`/host/listings/${id}/blocked-dates`, { method: "POST", body, auth: true });
export const unblockDates = (id: number, periodId: number) => request<void>(`/host/listings/${id}/blocked-dates/${periodId}`, { method: "DELETE", auth: true });
export const getHostBookings = (listingId?: number, signal?: AbortSignal) => request<Api.HostBooking[]>(`/host/bookings${queryString({ listing_id: listingId })}`, { auth: true, signal });
export const createListing = (body: Api.ListingInput) => request<Api.ListingDetail>("/listings", { method: "POST", body, auth: true });
export const updateListing = (id: number, body: Api.ListingInput) => request<Api.ListingDetail>(`/listings/${id}`, { method: "PUT", body, auth: true });
export const deleteListing = (id: number) => request<void>(`/listings/${id}`, { method: "DELETE", auth: true });
export const uploadPhoto = (file: File) => { const form = new FormData(); form.append("file", file); return request<Api.Upload>("/uploads", { method: "POST", body: form, auth: true }); };
export const login = (body: { email: string; password: string }) => request<Api.AuthResponse>("/auth/login", { method: "POST", body });
export const register = (body: { name: string; email: string; password: string }) => request<Api.AuthResponse>("/auth/register", { method: "POST", body });
export const googleLogin = (body: { credential: string }) => request<Api.AuthResponse>("/auth/google", { method: "POST", body });
export const getCurrentUser = (signal?: AbortSignal) => request<Api.UserPrivate>("/auth/me", { auth: true, signal });
export const getUserProfile = (id: number, signal?: AbortSignal) => request<Api.PublicProfile>(`/users/${id}`, { signal });
export const getUserListings = (id: number, signal?: AbortSignal) => request<Api.ListingCard[]>(`/users/${id}/listings`, { signal });
export const getUserReviews = (id: number, about: "host" | "guest", page = 1, signal?: AbortSignal) => request<Api.Page<Api.ProfileReview>>(`/users/${id}/reviews${queryString({ about, page, page_size: 20 })}`, { signal });
export const updateProfile = (body: Api.ProfileUpdate) => request<Api.UserPrivate>("/users/me", { method: "PATCH", body, auth: true });
export const verifyIdentity = () => request<Api.UserPrivate>("/users/me/identity-verification", { method: "POST", auth: true });
export const getConversations = (signal?: AbortSignal) => request<Api.ConversationSummary[]>("/conversations", { auth: true, signal });
export const createConversation = (body: { listing_id: number; body: string }) => request<Api.ConversationSummary>("/conversations", { method: "POST", body, auth: true });
export const getMessages = (id: number, params: { after_id?: number; before_id?: number; limit?: number } = {}, signal?: AbortSignal) => request<Api.Message[]>(`/conversations/${id}/messages${queryString(params)}`, { auth: true, signal });
export const sendMessage = (id: number, body: { body: string }) => request<Api.Message>(`/conversations/${id}/messages`, { method: "POST", body, auth: true });
export const markConversationRead = (id: number) => request<void>(`/conversations/${id}/read`, { method: "POST", auth: true });
export const getUnreadCount = (signal?: AbortSignal) => request<{ count: number }>("/conversations/unread-count", { auth: true, signal });
export const queryKeys = {
  listings: (params: Api.ListingQuery = {}) => ["listings", params] as const,
  listing: (id: number) => ["listing", id] as const,
  hostListing: (id: number) => ["host-listing", id] as const,
  blockedDates: (id: number) => ["blocked-dates", id] as const,
  availability: (id: number) => ["availability", id] as const,
  bookedDates: (id: number) => ["availability", id] as const,
  quote: (id: number, params: Api.StayParams) => ["quote", id, params] as const,
  reviews: (id: number, page = 1) => ["reviews", id, page] as const,
  wishlist: ["wishlists"] as const, wishlists: ["wishlists"] as const,
  wishlistDetail: (id: number) => ["wishlists", id] as const, savedListings: ["saved-listings"] as const,
  bookings: ["bookings"] as const, hostListings: ["host-listings"] as const, hostBookings: ["host-bookings"] as const,
  categories: ["categories"] as const, amenities: ["amenities"] as const, serviceArea: ["service-area"] as const,
  profile: (id: number) => ["profile", id] as const, userListings: (id: number) => ["user-listings", id] as const,
  userReviews: (id: number, about: "host" | "guest", page = 1) => ["user-reviews", id, about, page] as const,
  conversations: ["conversations"] as const, unreadCount: ["unread-count"] as const,
  messages: (id: number) => ["messages", id] as const,
};
