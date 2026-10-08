"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import styles from "./profiles.module.css";

const languages = ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Malayalam", "Marathi", "Bengali", "Gujarati", "Punjabi", "Urdu", "Assamese", "Odia", "French", "Spanish", "German", "Italian", "Portuguese", "Arabic", "Japanese", "Korean", "Mandarin", "Russian", "Dutch", "Indonesian", "Thai"];
export function LanguagesModal({ open = true, selected, onClose, onSave }: { open?: boolean; selected: string[]; onClose: () => void; onSave: (languages: string[]) => void }) {
  const [draft, setDraft] = useState(selected), [search, setSearch] = useState("");
  const choices = Array.from(new Set([...selected, ...languages])).filter(language => language.toLowerCase().includes(search.toLowerCase()));
  return <Modal open={open} onClose={() => { setDraft(selected); setSearch(""); onClose(); }} title="Languages I speak" footer={<div className={styles.modalActions}><span className="muted">{draft.length}/10 selected</span><button type="button" className="dark-button" onClick={() => onSave(draft)}>Save</button></div>}><p className="muted">Choose up to 10 languages.</p><label className={styles.field}>Find a language<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search languages" /></label><div className={styles.chips}>{draft.map(language => <button type="button" key={language} onClick={() => setDraft(value => value.filter(item => item !== language))}>{language}<X size={14} aria-label={`Remove ${language}`} /></button>)}</div><div className={styles.languageOptions}>{choices.map(language => <label key={language}><span>{language}</span><input type="checkbox" checked={draft.includes(language)} disabled={!draft.includes(language) && draft.length >= 10} onChange={event => setDraft(value => event.target.checked ? [...value, language] : value.filter(item => item !== language))} />{draft.includes(language) && <Check size={16} aria-hidden="true" />}</label>)}{!choices.length && <p className="muted">No languages match your search.</p>}</div></Modal>;
}
