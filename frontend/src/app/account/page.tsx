"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { BriefcaseBusiness, ChevronLeft, ChevronRight, Heart, LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import styles from "@/components/profiles/profiles.module.css";

export default function AccountPage() {
  const { user, status, openAuth, logout } = useAuth();
  const [informationOpen, setInformationOpen] = useState(false);
  const informationTrigger = useRef<HTMLButtonElement>(null), informationHeading = useRef<HTMLHeadingElement>(null);
  return <section className={styles.accountPage} data-signed-in={Boolean(user)} data-account-panel={informationOpen || !user ? "information" : "menu"}>
    <aside className={styles.accountNavigation}><Link href="/" className={styles.mobileAccountBack} aria-label="Back to explore"><ChevronLeft size={20} /></Link><h1>Account settings</h1>{user && <nav aria-label="Account settings"><button ref={informationTrigger} type="button" className={styles.activeAccountItem} onClick={() => { setInformationOpen(true); requestAnimationFrame(() => informationHeading.current?.focus({ preventScroll: true })); }}><UserRound size={24} /><span>Personal information</span><ChevronRight size={18} className={styles.accountChevron} /></button><Link href={`/users/${user.id}`}><UserRound size={24} /><span>Profile</span><ChevronRight size={18} className={styles.accountChevron} /></Link><Link href="/account/verify"><ShieldCheck size={24} /><span>Identity verification</span><ChevronRight size={18} className={styles.accountChevron} /></Link><Link href="/trips"><BriefcaseBusiness size={24} /><span>Trips</span><ChevronRight size={18} className={styles.accountChevron} /></Link><Link href="/wishlists"><Heart size={24} /><span>Wishlists</span><ChevronRight size={18} className={styles.accountChevron} /></Link><Link href="/hosting"><BriefcaseBusiness size={24} /><span>Hosting</span><ChevronRight size={18} className={styles.accountChevron} /></Link><button type="button" onClick={logout}><LogOut size={24} /><span>Log out</span></button></nav>}</aside>
    <div className={styles.accountContent}>
      {user && <button type="button" className={styles.mobileAccountBack} onClick={() => { setInformationOpen(false); requestAnimationFrame(() => informationTrigger.current?.focus({ preventScroll: true })); }} aria-label="Back to account settings"><ChevronLeft size={20} /></button>}
      {status === "loading" ? <><h2>Personal information</h2><p className="muted">Manage your trips and saved stays in one place.</p><div className="skeleton" aria-label="Loading account" style={{ height: 240 }} /></> : !user ? <><h2>Personal information</h2><p className="muted">Log in to manage your trips and saved stays in one place.</p><button className="dark-button" onClick={() => openAuth()}>Log in</button></> : <>
        <h2 ref={informationHeading} tabIndex={-1}>Personal information</h2>
        <div className={styles.accountRow}><div><h3>Name</h3><p>{user.name}</p></div><Link href="/account/profile">Edit</Link></div>
        <div className={styles.accountRow}><div><h3>Email address</h3><p>{user.email}</p></div></div>
        <div className={styles.accountRow}><div><h3>Identity verification</h3><p>{user.is_identity_verified ? "Verified" : "Not verified"}</p></div><Link href="/account/verify">{user.is_identity_verified ? "View" : "Verify"}</Link></div>
        <div className={styles.accountRow}><div><h3>Where I live</h3><p>{user.lives_in || "Not provided"}</p></div><Link href="/account/profile">{user.lives_in ? "Edit" : "Add"}</Link></div>
        <div className={styles.accountRow}><div><h3>Languages I speak</h3><p>{user.languages?.length ? new Intl.ListFormat("en-IN").format(user.languages) : "Not provided"}</p></div><Link href="/account/profile">{user.languages?.length ? "Edit" : "Add"}</Link></div>
        <p className={styles.accountExplanation}>Your public profile helps hosts and guests get to know you. Your email address stays private.</p>
      </>}
    </div>
  </section>;
}
