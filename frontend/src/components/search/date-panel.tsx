"use client";

import type { DateRange } from "react-day-picker";
import { DatePicker } from "@/components/calendar/date-picker";
import { useEffect, useState } from "react";
import styles from "./search.module.css";

export function DatePanel({ value, onChange }: { value: DateRange | undefined; onChange: (value: DateRange | undefined) => void }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 743px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return <><div className={styles.dateMode}><span>Dates</span></div><div className={styles.dateCalendar}><DatePicker value={value} onChange={onChange} numberOfMonths={mobile ? 12 : 2} hideNavigation={mobile} /></div><div className={styles.dateFooter}><span>Select your travel dates</span><button className={styles.clear} onClick={() => onChange(undefined)}>Clear dates</button></div></>;
}
