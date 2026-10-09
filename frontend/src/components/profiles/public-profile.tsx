"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Check, ChevronLeft, ChevronRight, Languages, MapPin, ShieldCheck, X } from "lucide-react";
import { ApiError, getUserListings, getUserProfile, queryKeys } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { ListingCard } from "@/components/listings/listing-card";
import { Modal } from "@/components/ui/modal";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileReviews } from "./profile-reviews";
import { ProfileError, ProfileLoading } from "./profile-states";
import { OwnProfile } from "./own-profile";
import styles from "./profiles.module.css";

export function PublicProfile({ id, account = false }: { id: number; account?: boolean }) {
  const { user } = useAuth(), track = useRef<HTMLDivElement>(null), router = useRouter();
  const [now] = useState(() => Date.now());
  const [identityOpen, setIdentityOpen] = useState(false);
  const profile = useQuery({ queryKey: queryKeys.profile(id), queryFn: ({ signal }) => getUserProfile(id, signal) });
  const listings = useQuery({ queryKey: queryKeys.userListings(id), queryFn: ({ signal }) => getUserListings(id, signal), enabled: !!profile.data });
  if (profile.isPending) return <ProfileLoading />;
  if (profile.isError) return <ProfileError message={profile.error instanceof ApiError && profile.error.status === 404 ? "This profile isn't available." : profile.error.message} retry={() => void profile.refetch()} />;
  const person = profile.data, host = person.listing_count > 0;
  const years = Math.max(0, Math.floor((now - new Date(person.created_at).getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
  const languages = new Intl.ListFormat("en-IN", { style: "long", type: "conjunction" }).format(person.languages);
  if (user?.id === id) return <OwnProfile person={person} account={account} />;
  return <div className={styles.publicPage}><header className={styles.mobilePublicHeader}><button type="button" aria-label="Close profile" onClick={() => { if (window.history.length > 1) router.back(); else router.push("/"); }}><X size={20} /></button></header><aside className={styles.sidebar}><div className={styles.passport}><div className={styles.passportIdentity}><ProfileAvatar user={person} /><h1>{person.name}</h1><p>{person.is_superhost ? "Superhost" : host ? "Host" : "Guest"}</p></div><dl className={styles.stats}><div><dt>{host ? person.host_review_count : person.guest_review_count}</dt><dd>Reviews</dd></div>{host && <div><dt>{person.host_rating === null ? "New" : `${person.host_rating.toFixed(2)}★`}</dt><dd>Rating</dd></div>}<div><dt>{years}</dt><dd>{host ? "Years hosting" : "Years on Airbnb"}</dd></div></dl></div><section className={styles.confirmed}><h2>{person.name}&apos;s confirmed information</h2>{person.is_identity_verified ? <p><Check size={20} /> Identity</p> : <p className="muted">Identity not verified</p>}{user?.id === id && <><Link href="/account/profile" className="text-button">Edit profile</Link>{!person.is_identity_verified && <Link href="/account/verify" className="text-button">Verify your identity</Link>}</>}</section></aside><div className={styles.profileMain}><section className={styles.about}><h2>About {person.name}</h2><div className={styles.aboutRows}>{person.work && <p><BriefcaseBusiness size={24} />My work: {person.work}</p>}{languages && <p><Languages size={24} />Speaks {languages}</p>}{person.lives_in && <p><MapPin size={24} />Lives in {person.lives_in}</p>}{person.is_identity_verified && <button type="button" className={styles.identityLink} onClick={() => setIdentityOpen(true)}><ShieldCheck size={24} />Identity verified</button>}</div>{person.about ? <p className={styles.plainText}>{person.about}</p> : !person.work && !languages && !person.lives_in && <p className="muted">{person.name} hasn&apos;t added an introduction yet.</p>}</section><ProfileReviews key={id} id={id} name={person.name} defaultAbout={host ? "host" : "guest"} />{host && <section className={styles.section}><div className={styles.sectionHeading}><h2>{person.name}&apos;s listings</h2><div className={styles.arrows}><button className="outline-button" aria-label="Previous listings" onClick={() => track.current?.scrollBy({ left: -320, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ChevronLeft size={16} /></button><button className="outline-button" aria-label="Next listings" onClick={() => track.current?.scrollBy({ left: 320, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ChevronRight size={16} /></button></div></div>{listings.isPending ? <p>Loading listings…</p> : listings.isError ? <div role="alert"><p className="error-text">{listings.error.message}</p><button className="text-button" onClick={() => void listings.refetch()}>Try again</button></div> : <div className={styles.listingTrack} ref={track} role="region" aria-roledescription="carousel" aria-label="Profile listings">{listings.data?.map(listing => <ListingCard key={listing.id} listing={listing} />)}{!listings.data?.length && <p className="muted">No active listings.</p>}</div>}</section>}</div><Modal open={identityOpen} onClose={() => setIdentityOpen(false)} title={`${person.name}'s identity verification`} presentation="profile" width={480}><div className={styles.identityDialog} data-profile-identity><div className={styles.identityCard}><div><h2>{person.name}</h2><p>Identity verified</p></div><ProfileAvatar user={person} size={88} /></div><p>This project uses demo identity verification. No government ID is selected, read or uploaded by this flow.</p>{user?.id === id && <Link href="/account/verify" className="text-button">View verification details</Link>}</div></Modal></div>;
}
