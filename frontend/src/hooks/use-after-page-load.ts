"use client";

import { useEffect, useState } from "react";

/** True once the page and its first images have loaded, for work that must not compete with them. */
export function useAfterPageLoad(delayMs = 300) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let timer: number | undefined;
    const done = () => { timer = window.setTimeout(() => setLoaded(true), delayMs); };
    if (document.readyState === "complete") done();
    else window.addEventListener("load", done, { once: true });
    return () => {
      window.removeEventListener("load", done);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [delayMs]);
  return loaded;
}
