import { ExploreClient } from "@/components/explore/explore-client";
import { getListings } from "@/lib/api";
import { toListingQuery } from "@/lib/search-params";
import { PageSearchProvider } from "@/hooks/use-search";

export default async function ExplorePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const entries = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value === "string") params.set(key, value);
    else value?.forEach(item => params.append(key, item));
  }
  const homepage = !params.size;
  const rawPage=Number(params.get("page"));
  const query = { ...toListingQuery(params), ...(homepage ? { page_size: 50 } : {page:Number.isInteger(rawPage)&&rawPage>0?rawPage:1,page_size:20}) };
  const initialData = await getListings(query, AbortSignal.timeout(4000)).catch(() => undefined);
  return <PageSearchProvider initialSearch={params.toString()}><ExploreClient initialData={initialData ? { query, data: initialData } : undefined} /></PageSearchProvider>;
}
