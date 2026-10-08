"use client";

import { AppImage as Image } from "@/components/ui/app-image";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Modal } from "@/components/ui/modal";
import { createReview, queryKeys } from "@/lib/api";
import { formatDateRange } from "@/lib/format";
import type { Booking, ReviewInput } from "@/types/api";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { StarRating } from "@/components/ui/star-rating";
import styles from "./trips.module.css";

const categories = [
  ["cleanliness", "Cleanliness"], ["accuracy", "Accuracy"], ["check_in", "Check-in"],
  ["communication", "Communication"], ["location", "Location"], ["value", "Value"],
] as const;
const initial: ReviewInput = { rating: 0, cleanliness: 0, accuracy: 0, check_in: 0, communication: 0, location: 0, value: 0, comment: "" };

export function ReviewModal({ booking, open, onClose }: { booking: Booking; open: boolean; onClose: () => void }) {
  const client = useQueryClient();const cooldown=useApiCooldown();
  const [draft, setDraft] = useState<ReviewInput>(initial);
  const [error, setError] = useState("");
  const comment = draft.comment.trim();
  const valid = draft.rating >= 1 && categories.every(([key]) => draft[key] >= 1) && comment.length >= 1 && comment.length <= 2000;
  const mutation = useMutation({
    mutationFn: (body: ReviewInput) => createReview(booking.id, body),
    onSuccess: async () => {
      client.setQueryData<Booking[]>(queryKeys.bookings, current => current?.map(trip => trip.id === booking.id ? { ...trip, has_review: true } : trip));
      toast.success("Thanks for your review!");
      onClose();
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.bookings }),
        client.invalidateQueries({ queryKey: ["reviews", booking.listing.id] }),
        client.invalidateQueries({ queryKey: queryKeys.listing(booking.listing.id) }),
        client.invalidateQueries({ queryKey: ["listings"] }),
        client.invalidateQueries({ queryKey: queryKeys.wishlist }),
        client.invalidateQueries({ queryKey: queryKeys.hostListings }),
        client.invalidateQueries({ queryKey: queryKeys.profile(booking.listing.host.id) }),
        client.invalidateQueries({ queryKey: queryKeys.userListings(booking.listing.host.id) }),
        client.invalidateQueries({ queryKey: ["user-reviews", booking.listing.host.id] }),
      ]);
    },
    onError: reason => {cooldown.record(reason);
      setError(reason instanceof Error ? reason.message : "Your review could not be submitted. Please try again.");
      void client.invalidateQueries({ queryKey: queryKeys.bookings });
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!open || !valid || mutation.isPending || cooldown.blocked) return;
    setError("");
    mutation.mutate({ ...draft, comment });
  }
  return <Modal open={open} onClose={() => { if (!mutation.isPending) onClose(); }} title="Leave a review" width={568}
    footer={<button className={`dark-button ${styles.submitReview}`} type="submit" form="trip-review-form" disabled={!open || !valid || mutation.isPending || cooldown.blocked}>{mutation.isPending ? "Submitting..." : "Submit review"}</button>}>
    <form id="trip-review-form" onSubmit={submit} className={styles.reviewForm}>
      <div className={styles.listingSummary}>{booking.listing.cover_image_url && <div className={styles.smallPhoto}><Image src={booking.listing.cover_image_url} alt={booking.listing.title} fill sizes="64px" /></div>}
        <div><h3>{booking.listing.title}</h3><p>{formatDateRange(booking.check_in, booking.check_out)}</p></div></div>
      <StarRating label="Overall" large value={draft.rating} disabled={mutation.isPending} onChange={rating => setDraft(value => ({ ...value, rating }))} />
      <div className={styles.categoryRatings}>{categories.map(([key, label]) => <StarRating key={key} label={label} value={draft[key]} disabled={mutation.isPending} onChange={rating => setDraft(value => ({ ...value, [key]: rating }))} />)}</div>
      <div className={styles.commentField}><label htmlFor="trip-review-comment">Share your experience</label><textarea id="trip-review-comment" value={draft.comment} onChange={event => setDraft(value => ({ ...value, comment: event.target.value }))} minLength={1} maxLength={2000} required disabled={mutation.isPending} aria-describedby="trip-review-help trip-review-count" />
        <div className={styles.commentMeta}><p id="trip-review-help">Rate every category and write at least one character.</p><span id="trip-review-count">{draft.comment.length}/2000</span></div></div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </form>
  </Modal>;
}
