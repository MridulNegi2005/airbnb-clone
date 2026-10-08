"use client";
import Link from "next/link";

import { useInfiniteQuery } from "@tanstack/react-query";
import { BadgeCheck, Check, KeyRound, MapPin, MessageCircle, Sparkles, Star, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { differenceInYears } from "date-fns";
import { getReviews, queryKeys } from "@/lib/api";
import { formatMonthYear, formatRating, plural } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import type { RatingSummary, Review, ReviewPage } from "@/types/api";
import { HostAvatar } from "./listing-information";
import styles from "./detail.module.css";

const categories: { key: keyof Pick<RatingSummary, "cleanliness" | "accuracy" | "check_in" | "communication" | "location" | "value">; name: string; icon: LucideIcon }[] = [
  { key: "cleanliness", name: "Cleanliness", icon: Sparkles }, { key: "accuracy", name: "Accuracy", icon: Check }, { key: "check_in", name: "Check-in", icon: KeyRound }, { key: "communication", name: "Communication", icon: MessageCircle }, { key: "location", name: "Location", icon: MapPin }, { key: "value", name: "Value", icon: BadgeCheck },
];

function RatingCategories({ summary }: { summary: RatingSummary }) {
  return <div className={styles.ratingCategories}>{categories.map(({ key, name, icon: Icon }) => summary[key] !== null && <div key={key}><strong>{name}</strong><span>{summary[key]?.toFixed(1)}</span><Icon size={28} strokeWidth={2} aria-hidden="true" /></div>)}</div>;
}

function ReviewCard({ review, full = false, onExpand }: { review: Review; full?: boolean; onExpand?: () => void }) {
  const years = Math.max(0, differenceInYears(new Date(), new Date(review.author.created_at)));
  return <article className={styles.reviewCard}><div className={styles.reviewAuthor}><HostAvatar host={review.author} size={48} /><div><Link href={`/users/${review.author.id}`}><strong>{review.author.name}</strong></Link><span>{years ? `${plural(years,"year")} on Airbnb clone` : `Joined ${formatMonthYear(new Date(review.author.created_at))}`}</span></div></div><div className={styles.reviewMeta}><span role="img" aria-label={`${review.rating} out of 5 stars`}>{Array.from({ length: 5 }, (_, index) => <Star key={index} size={10} fill={index < review.rating ? "currentColor" : "none"} aria-hidden="true" />)}</span><span aria-hidden="true">·</span><strong>{formatMonthYear(new Date(review.created_at))}</strong></div><p className={full ? styles.fullDescription : styles.reviewText}>{review.comment}</p>{!full && review.comment.length > 160 && <button className={styles.textButton} onClick={onExpand}>Show more</button>}</article>;
}

export function ReviewsSection({ listingId, initialReviews }: { listingId: number; initialReviews: ReviewPage }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const reviews = useInfiniteQuery({
    queryKey: [...queryKeys.reviews(listingId), "pages"],
    queryFn: ({ pageParam, signal }) => getReviews(listingId, pageParam, signal),
    initialPageParam: 1,
    initialData: { pages: [initialReviews], pageParams: [1] },
    getNextPageParam: (last) => last.has_more ? last.page + 1 : undefined,
    enabled: open,
  });
  const summary = reviews.data.pages[0]?.summary ?? initialReviews.summary;
  const loadedReviews = reviews.data.pages.flatMap((page) => page.items);
  const filtered = loadedReviews.filter((review) => `${review.comment} ${review.author.name}`.toLowerCase().includes(search.toLowerCase()));
  const heading = summary.rating === null ? "No reviews (yet)" : `${formatRating(summary.rating)} · ${plural(summary.count, "review")}`;
  return <section className={styles.fullSection} id="reviews"><h2 className={styles.reviewHeading}>{summary.rating !== null && <Star size={22} fill="currentColor" aria-hidden="true" />}{heading}</h2>{summary.count === 0 ? <p className={styles.secondary}>This host has 0 reviews for this place.</p> : <><RatingCategories summary={summary} /><div className={styles.reviewsGrid}>{loadedReviews.slice(0, 6).map((review) => <ReviewCard review={review} key={review.id} onExpand={() => setOpen(true)} />)}</div><button className={styles.outlinedButton} onClick={() => setOpen(true)}>Show all {summary.count} reviews</button></>}
    <Modal open={open} onClose={() => setOpen(false)} title="Reviews" presentation="reviews" width={720}><div className={styles.reviewsModal}><div className={styles.reviewSummary}><div className={styles.largeRating}>{formatRating(summary.rating)}</div><h2>{summary.rating !== null && summary.rating >= 4.9 && summary.count >= 5 ? "Guest favourite" : plural(summary.count,"review")}</h2><RatingCategories summary={summary} /></div><div className={styles.reviewModalContent}><label className={styles.reviewSearch}>Search reviews<input type="search" placeholder="Search reviews" value={search} onChange={(event) => setSearch(event.target.value)} /></label>{reviews.isError && <p className={styles.inlineError}>We couldn&apos;t load reviews. <button onClick={() => void reviews.refetch()}>Try again</button></p>}{filtered.length === 0 && <p>No matching reviews in the loaded results.</p>}<div className={styles.fullReviewList}>{filtered.map((review) => <ReviewCard review={review} full key={review.id} />)}</div>{reviews.hasNextPage && <button className={styles.outlinedButton} disabled={reviews.isFetchingNextPage} onClick={() => void reviews.fetchNextPage()}>{reviews.isFetchingNextPage ? "Loading reviews..." : "Load more reviews"}</button>}</div></div></Modal>
  </section>;
}
