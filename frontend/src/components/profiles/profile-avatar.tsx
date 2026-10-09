"use client";
import { useState, type CSSProperties } from "react";
import { UserRound } from "lucide-react";
import { AppImage } from "@/components/ui/app-image";
import type { UserPublic } from "@/types/api";
import styles from "./profiles.module.css";

export function ProfileAvatar({ user, size = 104, verified = true }: { user: Pick<UserPublic, "name" | "avatar_url" | "is_identity_verified">; size?: number; verified?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const badge = Math.min(32, Math.round(size * 4 / 13));
  return <span className={styles.avatar} style={{ width: size, height: size, "--verification-size": `${badge}px`, "--verification-offset": `${Math.max(1, Math.round(size / 26))}px` } as CSSProperties}>{user.avatar_url && failed !== user.avatar_url ? <AppImage src={user.avatar_url} alt={user.name} fill sizes={`${size}px`} onError={event => { if (!event.currentTarget.src.includes("/_next/image")) setFailed(user.avatar_url); }} /> : <UserRound size={size * .48} aria-label={user.name} />}{verified && user.is_identity_verified && <span className={styles.verified} title="Identity verified"><svg width={badge / 2} height={badge / 2} viewBox="0 0 16 16" role="img" aria-label="Identity verified"><path fill="currentColor" d="M8 0 1 3v5c0 4 7 8 7 8s7-4 7-8V3L8 0Z" /><path d="m4.5 7.5 2.25 2.25 4.75-4.5" fill="none" stroke="#E70066" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg></span>}</span>;
}
