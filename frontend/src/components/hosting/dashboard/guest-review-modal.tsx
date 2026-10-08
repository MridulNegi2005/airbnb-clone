"use client";
import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createGuestReview, queryKeys } from "@/lib/api";
import type { HostBooking, GuestReviewInput } from "@/types/api";
import { Modal } from "@/components/ui/modal";
import { AppImage } from "@/components/ui/app-image";
import { StarRating } from "@/components/ui/star-rating";
import { GradientButton } from "@/components/ui/gradient-button";

export function GuestReviewModal({booking,onClose,cooldown}:{booking:HostBooking;onClose:()=>void;cooldown:{blocked:boolean;record:(error:unknown)=>void}}){
  const [rating,setRating]=useState(0),[comment,setComment]=useState("");const client=useQueryClient();
  const mutation=useMutation({mutationFn:(body:GuestReviewInput)=>createGuestReview(booking.id,body),onError:reason=>cooldown.record(reason),onSuccess:async()=>{
    await Promise.all([client.invalidateQueries({queryKey:queryKeys.hostBookings}),client.invalidateQueries({queryKey:queryKeys.profile(booking.guest.id)}),client.invalidateQueries({queryKey:["user-reviews",booking.guest.id]})]);toast.success("Thanks for reviewing your guest");onClose();
  }});
  function submit(event:FormEvent){event.preventDefault();if(rating&&comment.trim()&&!mutation.isPending&&!cooldown.blocked)mutation.mutate({rating,comment:comment.trim()});}
  return <Modal open onClose={()=>{if(!mutation.isPending)onClose();}} title="Review your guest"><form onSubmit={submit} className="guest-review-form"><div className="guest-review-person">{booking.guest.avatar_url&&<AppImage src={booking.guest.avatar_url} alt="" width={64} height={64}/>}<h2>{booking.guest.name}</h2></div><StarRating label="Overall" large value={rating} onChange={setRating} disabled={mutation.isPending}/><label htmlFor="guest-review-comment">Share your experience</label><textarea id="guest-review-comment" required maxLength={2000} rows={5} value={comment} onChange={event=>setComment(event.target.value)} disabled={mutation.isPending}/><span className="small muted">{comment.length}/2000</span>{mutation.isError&&<p role="alert" className="error-text">{mutation.error.message}</p>}<GradientButton disabled={!rating||!comment.trim()||mutation.isPending||cooldown.blocked}>{mutation.isPending?"Submitting…":"Submit review"}</GradientButton></form></Modal>;
}
