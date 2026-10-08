"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Home, Hotel, House } from "lucide-react";
import { getAmenities, getListings } from "@/lib/api";
import { toListingQuery } from "@/lib/search-params";
import { useSearch } from "@/hooks/use-search";
import { Modal } from "@/components/ui/modal";
import { Stepper } from "@/components/ui/stepper";
import { PriceRange } from "./price-range";
import styles from "./search.module.css";

type Draft = { place_type: string; min_price: string; max_price: string; bedrooms: string; beds: string; bathrooms: string; property_types: string; amenities: string };
const empty: Draft = { place_type: "", min_price: "", max_price: "", bedrooms: "", beds: "", bathrooms: "", property_types: "", amenities: "" };
const propertyTypes = [{ value: "house", label: "House", Icon: House }, { value: "apartment", label: "Apartment", Icon: Building2 }, { value: "guesthouse", label: "Guesthouse", Icon: Home }, { value: "hotel", label: "Hotel", Icon: Hotel }];

export function FiltersModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <FiltersForm onClose={onClose} />;
}
function FiltersForm({ onClose }: { onClose: () => void }) {
  const { params, update } = useSearch();
  const [draft, setDraft] = useState<Draft>(() => Object.fromEntries(Object.keys(empty).map((key) => [key, params.get(key) ?? ""])) as Draft);
  const [debounced, setDebounced] = useState(draft);
  const [showAll, setShowAll] = useState(false);
  const amenities = useQuery({ queryKey: ["amenities"], queryFn: ({ signal }) => getAmenities(signal) });
  useEffect(() => { const timer = setTimeout(() => setDebounced(draft), 300); return () => clearTimeout(timer); }, [draft]);
  const queryParams = new URLSearchParams(params.toString());
  Object.entries(debounced).forEach(([key, value]) => value ? queryParams.set(key, value) : queryParams.delete(key));
  const countQuery = toListingQuery(queryParams);
  const count = useQuery({ queryKey: ["filter-count", countQuery], queryFn: ({ signal }) => getListings({ ...countQuery, page_size: 1 }, signal) });
  function field(key: keyof Draft, value: string) { setDraft((current) => ({ ...current, [key]: value })); }
  function toggle(key: "property_types" | "amenities", value: string) {
    const values = draft[key].split(",").filter(Boolean);
    field(key, (values.includes(value) ? values.filter((item) => item !== value) : [...values, value]).join(","));
  }
  const footer = <div className={styles.filterFooter}><button className={styles.clear} disabled={!Object.values(draft).some(Boolean)} onClick={() => setDraft(empty)}>Clear all</button><button className={styles.darkButton} onClick={() => { update(draft); onClose(); }}>{count.isFetching ? "Checking places..." : count.data ? `Show ${count.data.total} places` : "Show places"}</button></div>;
  return <Modal open onClose={onClose} title="Filters" width={780} footer={footer}>
    <section className={styles.filtersSection}><h2>Type of place</h2><div className={styles.segmented}>{[{ value: "", label: "Any type" }, { value: "private_room", label: "Room" }, { value: "entire_home", label: "Entire home" }].map((option) => <button key={option.value} className={draft.place_type === option.value ? styles.selected : ""} aria-pressed={draft.place_type === option.value} onClick={() => field("place_type", option.value)}>{option.label}</button>)}</div></section>
    <section className={styles.filtersSection}><h2>Price range</h2><p>Nightly prices before fees, in Indian rupees</p><PriceRange minimum={draft.min_price ? Number(draft.min_price) : 0} maximum={draft.max_price ? Number(draft.max_price) : 50000} onChange={(min, max) => setDraft((current) => ({ ...current, min_price: min === 0 ? "" : String(min), max_price: max >= 50000 ? "" : String(max) }))} /></section>
    <section className={styles.filtersSection}><h2>Rooms and beds</h2>{[{ key: "bedrooms", label: "Bedrooms" }, { key: "beds", label: "Beds" }, { key: "bathrooms", label: "Bathrooms" }].map(({ key, label }) => <div key={key} className={styles.guestRow}><span>{label}{!draft[key as keyof Draft] && <small className="ml-2 text-secondary">Any</small>}</span><Stepper label={label.toLowerCase()} value={Number(draft[key as keyof Draft]) || 0} min={0} max={50} step={key === "bathrooms" ? 0.5 : 1} onChange={(value) => field(key as keyof Draft, value ? String(value) : "")} /></div>)}</section>
    <section className={styles.filtersSection}><h2>Property type</h2><div className={styles.tiles}>{propertyTypes.map(({ value, label, Icon }) => { const selected = draft.property_types.split(",").includes(value); return <button key={value} aria-pressed={selected} className={`${styles.tile} ${selected ? styles.tileSelected : ""}`} onClick={() => toggle("property_types", value)}><Icon size={32} strokeWidth={2} /><span>{label}</span></button>; })}</div></section>
    <section className={styles.filtersSection}><h2>Amenities</h2><h3 className="mb-6 font-semibold">Essentials</h3>{amenities.isPending ? <p className={styles.status}>Loading amenities...</p> : amenities.isError ? <p className={styles.status}>Amenities could not be loaded. <button className={styles.clear} onClick={() => void amenities.refetch()}>Try again</button></p> : <><div className={styles.amenities}>{(showAll ? amenities.data : amenities.data?.slice(0, 6))?.map((amenity) => <label key={amenity.id}><input type="checkbox" checked={draft.amenities.split(",").includes(String(amenity.id))} onChange={() => toggle("amenities", String(amenity.id))} />{amenity.name}</label>)}</div>{(amenities.data?.length ?? 0) > 6 && <button className={`${styles.clear} mt-6`} onClick={() => setShowAll(!showAll)}>{showAll ? "Show less" : "Show more"}</button>}</>}</section>
    {count.isError && <p className="px-6 py-4 text-sm text-error">We couldn&apos;t check the number of stays. You can still apply your filters.</p>}
  </Modal>;
}


