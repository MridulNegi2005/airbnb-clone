"use client";

import { Stepper } from "@/components/ui/stepper";
import { Modal } from "@/components/ui/modal";
import { useState } from "react";
import styles from "./search.module.css";

export type GuestCounts = { adults: number; children: number; infants: number; pets: number };
export function GuestPanel({ guests, onChange }: { guests: GuestCounts; onChange: (guests: GuestCounts) => void }) {
  const [serviceAnimalOpen, setServiceAnimalOpen] = useState(false);
  const rows = [{ key: "adults", title: "Adults", subtitle: "Ages 13 or above" }, { key: "children", title: "Children", subtitle: "Ages 2-12" }, { key: "infants", title: "Infants", subtitle: "Under 2" }, { key: "pets", title: "Pets", subtitle: "Bringing a service animal?" }] as const;
  return <>{rows.map((row) => <div className={styles.guestRow} key={row.key}><div><strong>{row.title}</strong>{row.key === "pets" ? <button className="text-sm text-secondary underline" onClick={() => setServiceAnimalOpen(true)}>{row.subtitle}</button> : <small>{row.subtitle}</small>}</div><Stepper label={row.key} value={guests[row.key]} min={row.key === "adults" && guests.children + guests.infants + guests.pets > 0 ? 1 : 0} max={row.key === "adults" ? 16 - guests.children : row.key === "children" ? 16 - guests.adults : 5} onChange={(value) => onChange({ ...guests, [row.key]: value, adults: row.key === "adults" ? value : value > 0 ? Math.max(1, guests.adults) : guests.adults })} /></div>)}<Modal open={serviceAnimalOpen} onClose={() => setServiceAnimalOpen(false)} title="Service animals"><div className="p-6"><p>Service animal information is coming soon.</p></div></Modal></>;
}
