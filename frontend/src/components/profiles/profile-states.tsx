"use client";
import Link from "next/link";
import { UserRound } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import styles from "./profiles.module.css";

export function ProfileLoading() { return <div className={styles.loading} aria-label="Loading profile" aria-busy="true"><div className="skeleton" style={{ width: 320, maxWidth: "100%", height: 280 }} /><div><div className="skeleton" style={{ height: 36, width: "70%" }} /><div className="skeleton" style={{ height: 180, marginTop: 32 }} /></div></div>; }
export function ProfileSignIn({ title }: { title: string }) { const { openAuth } = useAuth(); return <div className={styles.state}><UserRound size={48} /><h1>{title}</h1><p>Log in to manage your profile and confirmed information.</p><button type="button" className="dark-button" onClick={() => openAuth()}>Log in</button><Link className="text-button" href="/">Back to home</Link></div>; }
export function ProfileError({ message, retry }: { message: string; retry?: () => void }) { return <div className={styles.state} role="alert"><UserRound size={48} /><h1>We couldn&apos;t load this profile</h1><p>{message}</p>{retry && <button type="button" className="outline-button" onClick={retry}>Try again</button>}<Link href="/" className="text-button">Back to home</Link></div>; }
