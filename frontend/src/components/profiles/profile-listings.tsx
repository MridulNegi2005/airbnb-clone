"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { getUserListings, getUserProfile, queryKeys } from "@/lib/api";
import { ProfileListingCard } from "./profile-listing-card";
import { ProfileError, ProfileLoading } from "./profile-states";
import styles from "./profiles.module.css";

export function ProfileListings({ id }: { id: number }) {
  const profile = useQuery({ queryKey: queryKeys.profile(id), queryFn: ({ signal }) => getUserProfile(id, signal) });
  const listings = useQuery({ queryKey: queryKeys.userListings(id), queryFn: ({ signal }) => getUserListings(id, signal) });
  if (profile.isPending || listings.isPending) return <ProfileLoading />;
  if (profile.isError || listings.isError) return <ProfileError message={profile.error?.message ?? listings.error?.message ?? "Listings could not load."} retry={() => { void profile.refetch(); void listings.refetch(); }} />;
  return <section className={styles.profileListingsPage}><Link href={`/users/${id}`} className={styles.back}><ChevronLeft size={18} />Back to profile</Link><h1>{profile.data.name.split(" ")[0]}&rsquo;s listings</h1><div className={styles.profileListingsGrid}>{listings.data.map(listing => <ProfileListingCard key={listing.id} listing={listing} />)}</div>{!listings.data.length && <p className="muted">No active listings.</p>}</section>;
}
