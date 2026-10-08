"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { getListings, queryKeys } from "@/lib/api";
import type { ListingCard, ListingQuery, Page } from "@/types/api";

export function useListings(query: ListingQuery, initialData?: Page<ListingCard>) {
  return useInfiniteQuery({
    queryKey: queryKeys.listings(query),
    queryFn: ({ pageParam, signal }) => getListings({ ...query, page: pageParam, page_size: query.page_size ?? 20 }, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    initialData: initialData ? { pages: [initialData], pageParams: [1] } : undefined,
    staleTime: 60_000,
    gcTime: 300_000,
  });
}
