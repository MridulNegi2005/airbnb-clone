"use client";

import { AppImage as Image } from "@/components/ui/app-image";
import { AlarmSmoke, Award, BadgeCheck, Car, Check, ChevronRight, Coffee, Dumbbell, Flame, Home, KeyRound, Monitor, Snowflake, Tv, Utensils, WashingMachine, Waves, Wifi, Wind, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ListingLocationMap } from "@/components/maps";
import { ComposeMessageModal } from "@/components/messages/compose-message-modal";
import { Modal } from "@/components/ui/modal";
import { formatRating, plural } from "@/lib/format";
import { isGuestFavourite } from "@/lib/listing";
import { getUserProfile, queryKeys } from "@/lib/api";
import type { ListingDetail, UserPublic } from "@/types/api";
import styles from "./detail.module.css";

const amenityIcons: Record<string, LucideIcon> = { wifi: Wifi, kitchen: Utensils, pool: Waves, "hot-tub": Waves, "air-conditioning": Snowflake, heating: Flame, tv: Tv, washer: WashingMachine, gym: Dumbbell, coffee: Coffee, "coffee-maker":Coffee, parking: Car, "free-parking":Car, "workspace":Monitor, "dedicated-workspace":Monitor, "hair-dryer":Wind, "self-check-in":KeyRound, "smoke-alarm":AlarmSmoke, "carbon-monoxide-alarm":AlarmSmoke, home:Home };
function AmenityIcon({ icon }: { icon: string }) { const Icon = amenityIcons[icon] ?? Check; return <Icon size={24} strokeWidth={2} aria-hidden="true" />; }

export function HostAvatar({ host, size = 40 }: { host: UserPublic; size?: number }) {
  return <span className={styles.avatar} style={{ width: size, height: size }}>{host.avatar_url ? <Image src={host.avatar_url} alt={`${host.name}'s profile photo`} fill sizes={`${size}px`} /> : <span aria-label={host.name}>{host.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span>}</span>;
}

export function ListingInformation({ listing }: { listing: ListingDetail }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [amenitiesOpen, setAmenitiesOpen] = useState(false);
  const roomLabel = listing.room_type === "entire_home" ? {house:"Entire home",apartment:"Entire rental unit",guesthouse:"Entire guest house",hotel:"Hotel room"}[listing.property_type] : { private_room: "Private room", shared_room: "Shared room" }[listing.room_type];
  const hostYears = Math.max(0, new Date().getFullYear() - new Date(listing.host.created_at).getFullYear());
  return <>
    <section className={styles.overview}><h2>{roomLabel} in {listing.city}, {listing.country}</h2><p>{[plural(listing.max_guests, "guest"), plural(listing.bedrooms, "bedroom"), plural(listing.beds, "bed"), plural(listing.bathrooms, "bath")].join(" · ")}</p>
      {isGuestFavourite(listing) ? <a className={styles.favouriteSummary} href="#reviews"><Award size={30} aria-hidden="true" /><strong>Guest favourite</strong><span>One of the most loved homes, according to guests</span><strong>{formatRating(listing.rating)}<small>{plural(listing.review_count, "review")}</small></strong></a> : <a className={styles.ratingLink} href="#reviews">{listing.rating !== null ? <><span aria-hidden="true">★</span> {formatRating(listing.rating)} <span>·</span> <u>{plural(listing.review_count, "review")}</u></> : "New listing. Be the first to review this stay."}</a>}
    </section>
    <section className={styles.hostRow}><span className={styles.smallHostAvatar}><HostAvatar host={listing.host} />{listing.host.is_superhost && <Award size={18} aria-label="Superhost"/>}</span><div><Link href={`/users/${listing.host.id}`}><strong>Hosted by {listing.host.name}</strong></Link><p className={styles.secondary}>{[listing.host.is_superhost ? "Superhost" : "Host", hostYears > 0 ? plural(hostYears, "year") + " on Airbnb clone" : "Joined " + new Date(listing.host.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })].join(" · ")}</p></div></section>
    <section className={styles.section}><div className={styles.description}>{listing.description}</div><button className={styles.showMore} onClick={() => setAboutOpen(true)}>Show more <ChevronRight size={16} aria-hidden="true" /></button></section>
    <section className={styles.section} id="amenities"><h2>What this place offers</h2>{listing.amenities.length ? <><div className={styles.amenityGrid}>{listing.amenities.slice(0, 10).map((amenity) => <div key={amenity.id}><AmenityIcon icon={amenity.icon} /><span>{amenity.name}</span></div>)}</div><button className={styles.outlinedButton} onClick={() => setAmenitiesOpen(true)}>Show all {listing.amenities.length} amenities</button></> : <p className={styles.secondary}>The host has not added amenities yet.</p>}</section>
    <Modal open={aboutOpen} onClose={() => setAboutOpen(false)} title="About this space"><div className={styles.modalPadding}><p className={styles.fullDescription}>{listing.description}</p></div></Modal>
    <Modal open={amenitiesOpen} onClose={() => setAmenitiesOpen(false)} title="What this place offers"><div className={styles.amenityModal}>{listing.amenities.map((amenity) => <div key={amenity.id}><AmenityIcon icon={amenity.icon} /><span>{amenity.name}</span></div>)}</div></Modal>
  </>;
}

export function LocationAndHost({ listing }: { listing: ListingDetail }) {
  const [messageOpen, setMessageOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const profile = useQuery({queryKey:queryKeys.profile(listing.host.id),queryFn:({signal})=>getUserProfile(listing.host.id,signal),staleTime:300_000});
  const hostYears = Math.max(0,new Date().getFullYear()-new Date(listing.host.created_at).getFullYear());
  return <>
    <section className={styles.fullSection} id="location"><h2>Where you&apos;ll be</h2><p>{listing.neighbourhood}, {listing.city}, {listing.country}</p><ListingLocationMap latitude={listing.latitude} longitude={listing.longitude} neighbourhood={listing.neighbourhood}/></section>
    <section className={styles.fullSection}><h2>Meet your host</h2><div className={styles.meetHost}><Link href={`/users/${listing.host.id}`} className={styles.hostCard}><div className={styles.hostIdentity}><div className={styles.passportAvatar}><HostAvatar host={listing.host} size={104} />{listing.host.is_identity_verified && <BadgeCheck size={28} fill="var(--brand)" color="white" aria-label="Identity verified"/>}</div><h3>{listing.host.name.split(" ")[0]}</h3><span>{listing.host.is_superhost ? "Superhost" : "Host"}</span></div><div className={styles.hostStats}>{profile.data && <><div><strong>{profile.data.host_review_count}</strong><span>{plural(profile.data.host_review_count,"review").replace(/^\d+ /,"")}</span></div>{profile.data.host_rating !== null && <div><strong>{formatRating(profile.data.host_rating)}<small>★</small></strong><span>Rating</span></div>}</>}<div><strong>{hostYears}</strong><span>{hostYears===1?"Year":"Years"} on Airbnb clone</span></div></div></Link><div><h3>{listing.host.is_superhost ? `${listing.host.name} is a Superhost` : `Hosted by ${listing.host.name}`}</h3>{listing.host.about ? <p className={styles.fullDescription}>{listing.host.about}</p> : <p className={styles.secondary}>The host hasn&apos;t added a bio yet.</p>}<button className={styles.messageHost} onClick={() => setMessageOpen(true)}>Message host</button></div></div></section>
    <section className={styles.fullSection}><h2>Things to know</h2><div className={styles.knowGrid}><div><h3>Cancellation policy</h3><p>Review the booking terms before confirming your trip.</p></div><div><h3>House rules</h3><p>{plural(listing.max_guests, "guest")} maximum</p><button className={styles.showMore} onClick={() => setRulesOpen(true)}>Learn more <ChevronRight size={16} /></button></div><div><h3>Safety &amp; property</h3>{listing.amenities.some(amenity=>amenity.name.toLowerCase().includes("alarm")) ? listing.amenities.filter(amenity=>amenity.name.toLowerCase().includes("alarm")).map(amenity=><p key={amenity.id}>{amenity.name}</p>) : <p>Safety details have not been provided.</p>}</div></div></section>
    <ComposeMessageModal open={messageOpen} onClose={()=>setMessageOpen(false)} listingId={listing.id} hostName={listing.host.name}/>
    <Modal open={rulesOpen} onClose={() => setRulesOpen(false)} title="House rules"><div className={styles.modalPadding}><p>{plural(listing.max_guests, "guest")} maximum. Detailed house rules are not provided for this stay.</p></div></Modal>
  </>;
}
