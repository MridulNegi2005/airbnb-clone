"use client";

import { useQuery } from "@tanstack/react-query";
import { getBookedDates, queryKeys } from "@/lib/api";

export function useAvailability(id: number) {
  return useQuery({
    queryKey: queryKeys.availability(id),
    queryFn: ({ signal }) => getBookedDates(id, signal),
    staleTime: 30_000,
  });
}
