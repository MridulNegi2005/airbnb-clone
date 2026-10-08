"use client";
import { useState } from "react";
import { ShieldCheck, UserRound } from "lucide-react";
import { AppImage } from "@/components/ui/app-image";
import type { UserPublic } from "@/types/api";
import styles from "./profiles.module.css";

export function ProfileAvatar({ user, size = 104 }: { user: Pick<UserPublic, "name" | "avatar_url" | "is_identity_verified">; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <span className={styles.avatar} style={{ width: size, height: size }}>{user.avatar_url && failed !== user.avatar_url ? <AppImage src={user.avatar_url} alt={user.name} fill sizes={`${size}px`} onError={event => { if (!event.currentTarget.src.includes("/_next/image")) setFailed(user.avatar_url); }} /> : <UserRound size={size * .48} aria-label={user.name} />}{user.is_identity_verified && <span className={styles.verified} title="Identity verified"><ShieldCheck size={20} aria-label="Identity verified" /></span>}</span>;
}
