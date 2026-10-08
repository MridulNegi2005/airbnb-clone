"use client";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

export function useSendCooldown() {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!until) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [until]);
  function record(error: unknown) {
    if (error instanceof ApiError && error.status === 429) {
      const time = Date.now();
      setNow(time); setUntil(time + error.retryAfterSeconds * 1000);
    }
  }
  return { blocked: until > now, record };
}
