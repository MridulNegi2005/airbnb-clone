"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";

export const loadDatePicker = () => import("./date-picker").then(module => module.DatePicker);

// The calendar is heavy and only appears after a click: keep it out of the first load, then fetch it while the page is idle.
export const DatePicker = dynamic(loadDatePicker, { ssr: false, loading: () => <div style={{ minHeight: 320 }} aria-busy="true" /> });

export function usePreloadDatePicker() {
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 1500));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => void loadDatePicker());
    return () => cancel(handle);
  }, []);
}
