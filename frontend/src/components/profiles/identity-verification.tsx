"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Check, ChevronLeft, FileCheck2, IdCard, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { queryKeys, verifyIdentity } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { GradientButton } from "@/components/ui/gradient-button";
import { ProfileLoading, ProfileSignIn } from "./profile-states";
import { useProfileCooldown } from "./use-profile-cooldown";
import styles from "./profiles.module.css";

export function IdentityVerification() {
  const { user, status, updateUser } = useAuth(), client = useQueryClient(), cooldown = useProfileCooldown();
  const [selected, setSelected] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  if (status === "loading") return <ProfileLoading />;
  if (!user) return <ProfileSignIn title="Verify your identity" />;
  async function verify() {
    if (!selected || pending || cooldown.remaining) return; setPending(true); setError("");
    try { const updated = await verifyIdentity(); updateUser(updated); await client.invalidateQueries({ queryKey: queryKeys.profile(updated.id) }); toast.success("Identity verified"); }
    catch (reason) { cooldown.capture(reason); setError(reason instanceof Error ? reason.message : "Verification couldn't be completed. Try again."); }
    finally { setPending(false); }
  }
  return <div className={styles.verifyPage}><Link href="/account" className={styles.back}><ChevronLeft size={18} />Account</Link>{user.is_identity_verified ? <section className={styles.verifySuccess} role="status"><span className={styles.successIcon}><ShieldCheck size={48} /></span><h1>You&apos;re verified</h1><p>Your identity verification is complete. Your badge now appears on your profile.</p><p className="muted small">This demo verification does not check a government ID.</p><Link href={`/users/${user.id}`} className="dark-button">View your profile</Link><Link href="/account/profile" className="text-button">Edit profile</Link></section> : <><IdCard size={48} /><h1>Let&apos;s add your government ID</h1><p className="muted">Confirming your identity helps build trust in our community.</p><div className={styles.demoNotice}><ShieldCheck size={22} /><div><strong>Demo: no file is sent</strong><p>No document is selected, read or uploaded. This mock flow only adds a demo verification badge.</p></div></div><ol className={styles.verifySteps}><li><span>1</span><div><strong>Choose an ID</strong><p>Use the sample document below.</p></div></li><li><span>2</span><div><strong>Verify your identity</strong><p>Our demo completes this step instantly.</p></div></li></ol><button type="button" className={`${styles.demoUpload} ${selected ? styles.demoSelected : ""}`} disabled={pending} aria-pressed={selected} onClick={() => setSelected(value => !value)}>{selected ? <FileCheck2 size={40} /> : <IdCard size={40} />}<strong>{selected ? "Demo ID selected" : "Choose sample ID"}</strong><span>Demo: no file is sent</span>{selected && <Check size={20} />}</button>{error && <p className="error-text" role="alert">{error}</p>}<GradientButton disabled={!selected || pending || cooldown.remaining > 0} onClick={() => void verify()}>{pending ? "Verifying…" : cooldown.remaining ? `Try again in ${cooldown.remaining}s` : "Verify"}</GradientButton></>}</div>;
}
