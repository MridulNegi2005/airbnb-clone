"use client";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import styles from "./profiles.module.css";

export type ProfileField = "name" | "work" | "lives_in" | "about";
const fields = {
  name: { title: "What should we call you?", label: "Name", description: "This is the name hosts and guests will see on your profile.", limit: 80 },
  work: { title: "What do you do for work?", label: "My work", description: "Tell us about your profession or your life's calling.", limit: 120 },
  lives_in: { title: "Where do you live?", label: "Where I live", description: "Share your city and country with hosts and guests.", limit: 120 },
  about: { title: "About you", label: "About you", description: "Write something fun and punchy so hosts and guests can get to know you.", limit: 1000 },
};

export function ProfileFieldModal({ open, field, value, onClose, onSave }: { open: boolean; field: ProfileField; value: string; onClose: () => void; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const configuration = fields[field];
  return <Modal open={open} onClose={() => { setDraft(value); onClose(); }} title={configuration.title} footer={<div className={styles.modalActions}><span /><button type="button" className="dark-button" disabled={field === "name" && !draft.trim()} onClick={() => onSave(draft)}>Save</button></div>}>
    <p className={styles.fieldDescription}>{configuration.description}</p>
    <label className={styles.field}>{configuration.label}{field === "about" ? <textarea autoFocus rows={6} value={draft} maxLength={configuration.limit} onChange={event => setDraft(event.target.value)} /> : <input autoFocus value={draft} maxLength={configuration.limit} autoComplete={field === "name" ? "name" : "off"} placeholder={field === "lives_in" ? "City, country" : configuration.label} onChange={event => setDraft(event.target.value)} />}</label>
    <p className={styles.counter}>{draft.length}/{configuration.limit}</p>
  </Modal>;
}
