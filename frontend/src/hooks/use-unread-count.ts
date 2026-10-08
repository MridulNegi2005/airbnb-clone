"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, getUnreadCount, queryKeys } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";

export function usePageVisible() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return visible;
}

export function useUnreadCount() {
  const { status } = useAuth();
  const visible = usePageVisible();
  const query = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: ({ signal }) => getUnreadCount(signal),
    enabled: status === "authenticated" && visible,
    refetchInterval: query => visible && !(query.state.error instanceof ApiError && query.state.error.status === 429) ? 30_000 : false,
    refetchIntervalInBackground: false,
  });
  return status === "authenticated" ? query.data?.count ?? 0 : 0;
}
