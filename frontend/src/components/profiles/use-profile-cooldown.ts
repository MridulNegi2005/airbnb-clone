"use client";
import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";

export function useProfileCooldown() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => { if (remaining <= 0) return; const timer = window.setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000); return () => window.clearTimeout(timer); }, [remaining]);
  return { remaining, capture: (error: unknown) => { if (error instanceof ApiError && error.status === 429) setRemaining(error.retryAfterSeconds); } };
}
