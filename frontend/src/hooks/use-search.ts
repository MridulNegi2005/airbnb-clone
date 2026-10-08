"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { toListingQuery } from "@/lib/search-params";

export function useSearch() {
  const router = useRouter();
  const params = useSearchParams();
  function update(values: Record<string, string | undefined>, clear = false, replace = false) {
    const next = clear ? new URLSearchParams() : new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    const validated = toListingQuery(next);
    const fields = { location: validated.location, category: validated.category, checkin: validated.check_in, checkout: validated.check_out, min_price: validated.min_price, max_price: validated.max_price, bedrooms: validated.min_bedrooms, beds: validated.min_beds, bathrooms: validated.min_bathrooms, place_type: validated.room_type, property_types: validated.property_type?.join(","), amenities: validated.amenity?.join(",") };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== "") next.set(key, String(value));
      else next.delete(key);
    }
    if (validated.sw_lat === undefined) for (const key of ["sw_lat", "sw_lng", "ne_lat", "ne_lng"]) next.delete(key);
    for (const key of ["adults", "children", "infants", "pets"]) {
      const raw = next.get(key);
      const count = Number(raw);
      if (raw && (!Number.isInteger(count) || count < 0 || count > (key === "infants" || key === "pets" ? 5 : 16))) next.delete(key);
    }
    if (Number(next.get("adults")) + Number(next.get("children")) > 16) { next.delete("adults"); next.delete("children"); }
    const query = next.toString();
    if (replace) window.history.replaceState(null, "", query ? `/?${query}` : "/");
    else router.push(query ? `/?${query}` : "/");
  }
  return { params, query: toListingQuery(new URLSearchParams(params.toString())), update };
}
