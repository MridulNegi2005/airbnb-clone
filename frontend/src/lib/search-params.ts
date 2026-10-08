import type { ListingQuery, PropertyType, RoomType } from "@/types/api";
import { validateStay } from "./dates";

const propertyTypes: PropertyType[] = ["house", "apartment", "guesthouse", "hotel"];
export function toListingQuery(params: URLSearchParams): ListingQuery {
  const result: ListingQuery = {};
  const location = params.get("location")?.trim();
  if (location) result.location = location.slice(0, 100);
  const category = params.get("category"); if (category) result.category = category;
  const checkIn = params.get("checkin"), checkOut = params.get("checkout");
  if (checkIn && checkOut && !validateStay(checkIn, checkOut)) { result.check_in = checkIn; result.check_out = checkOut; }
  const adults = Number(params.get("adults") ?? 0), children = Number(params.get("children") ?? 0);
  const guests = adults + children; if (Number.isInteger(guests) && guests > 0 && guests <= 16) result.guests = guests;
  const keys = { min_price: "min_price", max_price: "max_price", bedrooms: "min_bedrooms", beds: "min_beds", bathrooms: "min_bathrooms" } as const;
  for (const [urlKey, apiKey] of Object.entries(keys)) { const raw = params.get(urlKey); const n = Number(raw); if (raw && Number.isFinite(n) && n >= 0) result[apiKey] = n; }
  if (result.min_price !== undefined && result.max_price !== undefined && result.min_price > result.max_price) { delete result.min_price; delete result.max_price; }
  const room = params.get("place_type"); if (["entire_home", "private_room", "shared_room"].includes(room ?? "")) result.room_type = room as RoomType;
  const types = params.get("property_types")?.split(",").filter((value): value is PropertyType => propertyTypes.includes(value as PropertyType));
  if (types?.length) result.property_type = types;
  const amenity = params.get("amenities")?.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (amenity?.length) result.amenity = amenity;
  const mapKeys = ["sw_lat", "sw_lng", "ne_lat", "ne_lng"] as const;
  const bounds = mapKeys.map(key => params.get(key));
  if (bounds.every(value => value !== null && value.trim() !== "")) {
    const [south, west, north, east] = bounds.map(Number);
    if (south !== undefined && west !== undefined && north !== undefined && east !== undefined && [south, west, north, east].every(Number.isFinite) && Math.abs(south) <= 90 && Math.abs(north) <= 90 && Math.abs(west) <= 180 && Math.abs(east) <= 180 && south <= north && west <= east) {
      result.sw_lat = south; result.sw_lng = west; result.ne_lat = north; result.ne_lng = east;
    }
  }
  return result;
}
