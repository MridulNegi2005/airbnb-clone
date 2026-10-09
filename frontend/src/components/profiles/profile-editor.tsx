"use client";
import { useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Camera, ChevronLeft, ChevronRight, Languages, MapPin, Pencil, ShieldCheck, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import { queryKeys, updateProfile, uploadPhoto } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { ProfileFieldModal, type ProfileField } from "./profile-field-modal";
import type { ProfileUpdate, UserPrivate } from "@/types/api";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileLoading, ProfileSignIn } from "./profile-states";
import { LanguagesModal } from "./languages-modal";
import { useProfileCooldown } from "./use-profile-cooldown";
import styles from "./profiles.module.css";
import { PublicProfile } from "./public-profile";

export function ProfileEditor({ edit = true }: { edit?: boolean }) {
  const { user, status } = useAuth();
  if (status === "loading") return <ProfileLoading />;
  if (!user) return <ProfileSignIn title="Edit your profile" />;
  if (!edit) return <PublicProfile id={user.id} account />;
  return <Editor key={user.id} user={user} />;
}

function Editor({ user }: { user: UserPrivate }) {
  const { updateUser } = useAuth(), client = useQueryClient(), router = useRouter(), fileInput = useRef<HTMLInputElement>(null), cooldown = useProfileCooldown();
  const [draft, setDraft] = useState({ name: user.name, work: user.work ?? "", lives_in: user.lives_in ?? "", about: user.about ?? "", languages: user.languages ?? [] });
  const mutationLock = useRef(false);
  const [uploadPhase, setUploadPhase] = useState<"queued" | "uploading" | "processing">("uploading");
  const [editing, setEditing] = useState<ProfileField | null>(null);
  const [modalField, setModalField] = useState<ProfileField>("name");
  const [fieldSession, setFieldSession] = useState(0);
  function openField(field: ProfileField) {
    setModalField(field); setFieldSession(value => value + 1); setEditing(field);
  }
  function closeField() { setEditing(null); }
  const [languagesSession, setLanguagesSession] = useState(0);
  const [languagesOpen, setLanguagesOpen] = useState(false), [pending, setPending] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState("");
  function changes(): ProfileUpdate {
    const body: ProfileUpdate = {};
    if (draft.name.trim() !== user.name) body.name = draft.name.trim();
    for (const field of ["work", "lives_in", "about"] as const) { const value = draft[field].trim() || null; if (value !== (user[field] ?? null)) body[field] = value; }
    if (JSON.stringify(draft.languages) !== JSON.stringify(user.languages ?? [])) body.languages = draft.languages;
    return body;
  }
  const dirty = Object.keys(changes()).length > 0, busy = pending || uploading || cooldown.remaining > 0;
  function preventPendingNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (mutationLock.current) event.preventDefault();
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || mutationLock.current) return; const body = changes();
    if (!Object.keys(body).length) { router.push(`/users/${user.id}`); return; }
    mutationLock.current = true;
    setPending(true); setError("");
    try { const updated = await updateProfile(body); updateUser(updated); setDraft({ name: updated.name, work: updated.work ?? "", lives_in: updated.lives_in ?? "", about: updated.about ?? "", languages: updated.languages ?? [] }); await client.invalidateQueries({ queryKey: queryKeys.profile(updated.id) }); toast.success("Profile updated"); router.push(`/users/${updated.id}`); }
    catch (reason) { cooldown.capture(reason); setError(reason instanceof Error ? reason.message : "Your profile couldn't be saved. Try again."); }
    finally { setPending(false); mutationLock.current = false; }
  }
  async function avatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file || busy || mutationLock.current) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("Use a JPEG, PNG or WebP photo"); return; }
    if (file.size > 8 * 1024 * 1024) { setError("That photo is too large (max 8 MB)"); return; }
    mutationLock.current = true; setUploading(true); setUploadPhase("uploading"); setError("");
    try { const uploaded = await uploadPhoto(file, { onProgress: progress => setUploadPhase(progress.phase) }); const updated = await updateProfile({ avatar_url: uploaded.url }); updateUser(updated); await client.invalidateQueries({ queryKey: queryKeys.profile(updated.id) }); toast.success("Profile photo updated"); }
    catch (reason) { cooldown.capture(reason); setError(reason instanceof Error ? reason.message : "Your photo couldn't be uploaded. Try again."); }
    finally { setUploading(false); mutationLock.current = false; }
  }
  return <div className={styles.editorPage}>
    <header className={styles.mobileEditorHeader}><Link href={`/users/${user.id}`} aria-label="Close profile editor" aria-disabled={pending || uploading} onClick={preventPendingNavigation}><X size={20} /></Link><h2>Edit profile</h2></header>
    <Link href={`/users/${user.id}`} className={styles.back} aria-disabled={pending || uploading} onClick={preventPendingNavigation}><ChevronLeft size={18} />Profile</Link>
    <form onSubmit={save} className={styles.editor}>
      <aside className={styles.editAvatar}>
        <ProfileAvatar user={user} size={214} />
        <button type="button" className={styles.avatarEdit} disabled={busy} onClick={() => fileInput.current?.click()}><Camera size={16} />{uploading ? uploadPhase === "processing" ? "Processing…" : uploadPhase === "queued" ? "Queued…" : "Uploading…" : "Edit"}</button>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload profile photo" hidden onChange={event => void avatar(event)} />
      </aside>
      <div className={styles.editorFields}>
        <header className={styles.editorHeader}><h1>My profile</h1><p>Hosts and guests can see your profile and it may appear across Airbnb to help us build trust in our community.</p></header>
        <div className={styles.profileFieldRows}>
          <button type="button" disabled={pending} onClick={() => openField("name")}><UserRound size={24} /><span>Name: {draft.name}</span><Pencil size={16} /></button>
          <button type="button" disabled={pending} onClick={() => openField("work")}><BriefcaseBusiness size={24} /><span>{draft.work ? `My work: ${draft.work}` : "My work"}</span><Pencil size={16} /></button>
          <button type="button" disabled={pending} onClick={() => { setLanguagesSession(value => value + 1); setLanguagesOpen(true); }}><Languages size={24} /><span>{draft.languages.length ? `Languages I speak: ${new Intl.ListFormat("en-IN").format(draft.languages)}` : "Languages I speak"}</span><Pencil size={16} /></button>
          <button type="button" disabled={pending} onClick={() => openField("lives_in")}><MapPin size={24} /><span>{draft.lives_in ? `Where I live: ${draft.lives_in}` : "Where I live"}</span><Pencil size={16} /></button>
        </div>
        <section className={styles.aboutEditor}><h2>About me</h2>{draft.about ? <p className={styles.plainText}>{draft.about}</p> : <p className="muted">Write something fun and punchy.</p>}<button type="button" className="outline-button" disabled={pending} onClick={() => openField("about")}>{draft.about ? "Edit intro" : "Add intro"}</button></section>
        <Link href="/account/verify" className={styles.verificationLink} aria-disabled={pending || uploading} onClick={preventPendingNavigation}><ShieldCheck size={24} /><div><strong>{user.is_identity_verified ? "Identity verified" : "Verify your identity"}</strong><span>{user.is_identity_verified ? "Your identity badge appears on your profile." : "Add a verified badge to your profile with our demo flow."}</span></div><ChevronRight size={20} /></Link>
        {error && <p role="alert" className="error-text">{error}</p>}
      </div>
      <div className={styles.editorFooter}><span className="muted small">{cooldown.remaining > 0 ? `Try again in ${cooldown.remaining} seconds` : dirty ? "You have unsaved changes" : ""}</span><button type="submit" className="dark-button" disabled={busy || !draft.name.trim()}>{cooldown.remaining > 0 ? `Try again in ${cooldown.remaining}s` : pending ? "Saving…" : "Done"}</button></div>
    </form>
    <ProfileFieldModal key={`${modalField}-${fieldSession}`} open={editing !== null} field={modalField} value={draft[modalField]} onClose={closeField} onSave={value => { setDraft(previous => ({ ...previous, [modalField]: value })); closeField(); }} />
    <LanguagesModal key={languagesSession} open={languagesOpen} selected={draft.languages} onClose={() => setLanguagesOpen(false)} onSave={selected => { setDraft(value => ({ ...value, languages: selected })); setLanguagesOpen(false); }} />
  </div>;
}
