"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Star } from "lucide-react";
import { getUserReviews, queryKeys } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { ProfileAvatar } from "./profile-avatar";
import type { ProfileReview } from "@/types/api";
import styles from "./profiles.module.css";

function ReviewCard({ review, full = false, position }: { review: ProfileReview; full?: boolean; position?: string }) {
  return <article aria-label={position} aria-roledescription={position ? "slide" : undefined} className={`${styles.review} ${full ? styles.fullReview : ""}`}><Link href={`/users/${review.author.id}`} className={styles.reviewAuthor}><ProfileAvatar user={review.author} size={44} /><div><strong>{review.author.name}</strong><span>{new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(review.created_at))}</span></div></Link><div className={styles.reviewRating} aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={12} fill={index < review.rating ? "currentColor" : "none"} />)}</div><p className={full ? styles.plainText : styles.reviewComment}>{review.comment}</p><Link href={`/rooms/${review.listing.id}`} className={styles.reviewListing}>{review.listing.title}</Link></article>;
}

export function ProfileReviews({ id, name, defaultAbout = "host" }: { id: number; name: string; defaultAbout?: "host" | "guest" }) {
  const [about, setAbout] = useState<"host" | "guest">(defaultAbout), [open, setOpen] = useState(false), [page, setPage] = useState(1);
  const track = useRef<HTMLDivElement>(null);
  const reviews = useQuery({ queryKey: queryKeys.userReviews(id, about), queryFn: ({ signal }) => getUserReviews(id, about, 1, signal) });
  const all = useQuery({ queryKey: queryKeys.userReviews(id, about, page), queryFn: ({ signal }) => getUserReviews(id, about, page, signal), enabled: open });
  const tabs = <div className={styles.tabs} role="tablist" aria-label="Review type">{(["host", "guest"] as const).map(type => <button key={type} type="button" role="tab" aria-selected={about === type} tabIndex={about === type ? 0 : -1} onClick={() => { setAbout(type); setPage(1); }} onKeyDown={event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "host" : event.key === "End" ? "guest" : type === "host" ? "guest" : "host";
    setAbout(next); setPage(1);
    const index = next === "host" ? 0 : 1;
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[index]?.focus({ preventScroll: true });
  }}>{type === "host" ? "From guests" : "From hosts"}</button>)}</div>;
  return <section className={styles.section}><div className={styles.sectionHeading}><h2>{name}&apos;s reviews</h2><div className={styles.arrows}><button type="button" className="outline-button" aria-label="Previous reviews" onClick={() => track.current?.scrollBy({ left: -320, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ChevronLeft size={16} /></button><button type="button" className="outline-button" aria-label="Next reviews" onClick={() => track.current?.scrollBy({ left: 320, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" })}><ChevronRight size={16} /></button></div></div>{tabs}{reviews.isPending ? <p aria-live="polite">Loading reviews…</p> : reviews.isError ? <div role="alert"><p className="error-text">{reviews.error.message}</p><button type="button" className="text-button" onClick={() => void reviews.refetch()}>Try again</button></div> : reviews.data.items.length ? <><div key={about} className={styles.reviewTrack} ref={track} role="region" aria-roledescription="carousel" aria-label="Profile reviews">{reviews.data.items.map((review, index) => <ReviewCard key={review.id} review={review} position={`${index + 1} of ${reviews.data.items.length}`} />)}</div><button type="button" className="outline-button" onClick={() => { setPage(1); setOpen(true); }}>Show all {reviews.data.total} reviews</button></> : <p className="muted">No reviews {about === "host" ? "from guests" : "from hosts"} yet.</p>}<Modal open={open} onClose={() => setOpen(false)} title={`${name}'s reviews`} width={780}>{tabs}{all.isPending ? <p>Loading reviews…</p> : all.isError ? <div role="alert"><p className="error-text">{all.error.message}</p><button type="button" className="text-button" onClick={() => void all.refetch()}>Try again</button></div> : <><div key={`${about}-${page}`} className={styles.allReviews}>{all.data.items.map(review => <ReviewCard key={review.id} review={review} full />)}{all.data.total === 0 && <p className="muted">No reviews yet.</p>}</div><div className={styles.pagination}><button className="outline-button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page}</span><button className="outline-button" disabled={!all.data.has_more} onClick={() => setPage(value => value + 1)}>Next</button></div></>}</Modal></section>;
}
