import { Suspense } from "react";
import { ExploreClient } from "@/components/explore/explore-client";
import { ListingSkeleton } from "@/components/explore/listing-skeleton";
import { getListings } from "@/lib/api";
import { toListingQuery } from "@/lib/search-params";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const entries = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value === "string") params.set(key, value);
    else value?.forEach(item => params.append(key, item));
  }
  const homepage = !params.size;
  const query = { ...toListingQuery(params), ...(homepage || params.get("view") === "map" ? { page_size: 50 } : {}) };
  const initialData = await getListings(query, AbortSignal.timeout(4000)).catch(() => undefined);
  return <Suspense fallback={<div className="page-shell py-6"><ListingSkeleton /></div>}><ExploreClient initialData={initialData ? { query, data: initialData } : undefined} /></Suspense>;
}
