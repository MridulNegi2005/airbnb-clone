"use client";
import { useId, useState } from "react";
import { Modal } from "@/components/ui/modal";
import styles from "./profiles.module.css";

export type ProfileField = "name" | "work" | "lives_in" | "about";
const fields = {
  name: { title: "What should we call you?", label: "Name", description: "This is the name hosts and guests will see on your profile.", limit: 80 },
  work: { title: "What do you do for work?", label: "My work", description: "Tell us what your profession is. If you don't have a traditional job, tell us your life's calling. Example: Nurse, parent to four kids, or retired surfer.", limit: 120 },
  lives_in: { title: "Where do you live?", label: "Where I live", description: "Share your city and country with hosts and guests.", limit: 120 },
  about: { title: "About you", label: "About you", description: "Write something fun and punchy so hosts and guests can get to know you.", limit: 1000 },
};

export function ProfileFieldModal({ open, field, value, onClose, onSave }: { open: boolean; field: ProfileField; value: string; onClose: () => void; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  const formId = useId();
  const configuration = fields[field];
  const valid = field !== "name" || Boolean(draft.trim());
  return <Modal open={open} onClose={() => { setDraft(value); onClose(); }} title={configuration.title} presentation="profile" footer={<div className={styles.modalActions}><span /><button type="submit" form={formId} className="dark-button" disabled={!valid}>Save</button></div>}>
    <form id={formId} className={styles.profileFieldDialog} onSubmit={event => { event.preventDefault(); if (valid) onSave(draft); }}>
    <h2>{configuration.title}</h2>
    <p className={styles.fieldDescription}>{configuration.description}</p>
    <label className={styles.field}><span className="sr-only">{configuration.label}</span>{field === "about" ? <textarea rows={6} value={draft} maxLength={configuration.limit} aria-describedby={`${formId}-count`} onChange={event => setDraft(event.target.value)} /> : <input value={draft} maxLength={configuration.limit} aria-describedby={`${formId}-count`} autoComplete={field === "name" ? "name" : "off"} placeholder={field === "lives_in" ? "City, country" : `${configuration.label}:`} onChange={event => setDraft(event.target.value)} />}</label>
    <p id={`${formId}-count`} className={styles.counter}>{configuration.limit - draft.length} characters available</p>
    </form>
  </Modal>;
}
