"use client";

import { hashKey, keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { getListings, queryKeys } from "@/lib/api";
import type { ListingCard, ListingQuery, Page } from "@/types/api";

export type InitialListings = { query: ListingQuery; data: Page<ListingCard> };

export function useListings(query: ListingQuery, initial?: InitialListings) {
  const initialData = initial && hashKey(queryKeys.listings(initial.query)) === hashKey(queryKeys.listings(query)) ? initial.data : undefined;
  return useInfiniteQuery({
    queryKey: queryKeys.listings(query),
    queryFn: ({ pageParam, signal }) => getListings({ ...query, page: pageParam, page_size: query.page_size ?? 20 }, signal),
    initialPageParam: query.page ?? 1,
    getNextPageParam: (lastPage) => lastPage.has_more ? lastPage.page + 1 : undefined,
    initialData: initialData ? { pages: [initialData], pageParams: [query.page ?? 1] } : undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    gcTime: 300_000,
  });
}
