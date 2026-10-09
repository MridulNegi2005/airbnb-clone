"use client";

import { useRef, useState, type ReactNode } from "react";
import { AppImage as Image } from "@/components/ui/app-image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart, ImageOff, Star } from "lucide-react";
import type { ListingCard as ListingCardType } from "@/types/api";
import { useWishlist } from "@/hooks/use-wishlist";
import { formatDateRange, formatPrice, formatRating } from "@/lib/format";
import { isGuestFavourite } from "@/lib/listing";
import { nightlySubtotal } from "@/lib/pricing";
import styles from "./listing-card.module.css";

const gridImageSizes="(max-width:549px) calc(100vw - 48px), (max-width:743px) calc((100vw - 72px) / 2), (max-width:949px) calc((100vw - 104px) / 2), (max-width:1127px) calc((100vw - 128px) / 3), (max-width:1639px) calc((100vw - 232px) / 4), (max-width:1879px) calc((100vw - 256px) / 5), (max-width:2519px) calc((100vw - 280px) / 6), 374px";

export function ListingCard({listing,priority=false,searchParams="",imageSizes=gridImageSizes,compact=false,deferImage=false}: {
  listing:ListingCardType;priority?:boolean;searchParams?:string;imageSizes?:string;compact?:boolean;deferImage?:boolean;
}) {
  const {savedIds,toggle,isBlocked}=useWishlist();
  const params=new URLSearchParams(searchParams),checkIn=params.get("checkin"),checkOut=params.get("checkout");
  const saved=savedIds.has(listing.id);
  const href=`/rooms/${listing.id}${searchParams?`?${searchParams}`:""}`;
  const overlays=<>
    {isGuestFavourite(listing)&&<span className="guest-favourite">Guest favourite</span>}
    <button className="card-heart" type="button" aria-label={saved?"Remove from wishlist":"Add to wishlist"} aria-pressed={saved} disabled={isBlocked} onClick={()=>toggle(listing.id)}><Heart size={24} fill={saved?"var(--brand)":"rgba(0,0,0,.5)"} stroke="white" strokeWidth={2}/></button>
  </>;
  const compactTitle = `${listing.room_type === "private_room" ? "Room" : listing.room_type === "shared_room" ? "Shared room" : {apartment:"Flat",house:"Home",guesthouse:"Guesthouse",hotel:"Hotel"}[listing.property_type]} in ${listing.city}`;
  return <article className={`listing-card ${compact?styles.compact:styles.full}`}>
    <div className="listing-photo">
      {compact?<>
        <Link href={href} aria-label={`View ${listing.title}`} className="listing-photo-link">
          {listing.image_urls[0]?<div className="listing-slide">{!deferImage&&<Image src={listing.image_urls[0]} alt={`${listing.title}, photo 1`} fill loading={priority?"eager":undefined} fetchPriority={priority?"high":undefined} sizes={imageSizes}/>}</div>:<div className="photo-fallback" style={{height:"100%"}}><ImageOff size={32}/><span>No photo available</span></div>}
        </Link>
        {overlays}
      </>:<ListingPhotoCarousel listing={listing} href={href} priority={priority} imageSizes={imageSizes}>{overlays}</ListingPhotoCarousel>}
    </div>
    <Link href={href} className="listing-copy">
      <div className="listing-title-row"><h3>{compact?compactTitle:`${listing.neighbourhood}, ${listing.city}`}</h3>{!compact&&<span><Star size={12} fill="currentColor"/>{formatRating(listing.rating)}{listing.review_count>0&&<span>({listing.review_count})</span>}</span>}</div>
      {!compact&&<p className="muted listing-subtitle">{listing.title}</p>}
      {checkIn&&checkOut&&<p className="muted">{formatDateRange(checkIn,checkOut)}</p>}
      <p className="listing-price">{compact?<>{formatPrice(listing.price_per_night)} for 1 night<span className={styles.priceSeparator} aria-hidden="true">·</span><Star size={8} fill="currentColor" aria-hidden="true"/>{listing.rating===null?"New":listing.rating.toLocaleString("en-IN",{minimumFractionDigits:1,maximumFractionDigits:2})}</>:<><strong>{formatPrice(listing.price_per_night)}</strong> night</>}</p>
      {checkIn&&checkOut&&<p className="listing-total">{formatPrice(nightlySubtotal(listing.price_per_night,checkIn,checkOut))} before fees</p>}
    </Link>
  </article>;
}


/** Search-result cards retain their multi-photo interaction; compact home cards have one cover. */
function ListingPhotoCarousel({listing,href,priority,imageSizes,children}: {listing:ListingCardType;href:string;priority:boolean;imageSizes:string;children:ReactNode}) {
  const [index,setIndex]=useState(0);
  const [visited,setVisited]=useState(()=>new Set([0]));
  const track=useRef<HTMLDivElement>(null);
  const activeIndex=Math.min(index,Math.max(0,listing.image_urls.length-1));
  const dotStart=Math.max(0,Math.min(activeIndex-2,listing.image_urls.length-5));
  function select(next:number) {
    if(!Number.isFinite(next))return;
    const bounded=Math.max(0,Math.min(next,listing.image_urls.length-1));
    setIndex(bounded);
    setVisited(current=>current.has(bounded)?current:new Set([...current,bounded]));
  }
  function move(next:number) {
    select(next);
    track.current?.scrollTo({left:next*track.current.clientWidth,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  }
  return <>
    <Link href={href} aria-label={`View ${listing.title}`} className="listing-photo-link">
      <div ref={track} className="listing-carousel" onScroll={event=>{const carousel=event.currentTarget;if(carousel.clientWidth)select(Math.round(carousel.scrollLeft/carousel.clientWidth));}}>
        {listing.image_urls.length?listing.image_urls.map((url,i)=><div className="listing-slide" key={`${url}-${i}`}>
          {(visited.has(i)||Math.abs(i-activeIndex)<=1)&&<Image src={url} alt={`${listing.title}, photo ${i+1}`} fill loading={priority&&i===0?"eager":undefined} fetchPriority={priority&&i===0?"high":undefined} sizes={imageSizes}/>}
        </div>):<div className="photo-fallback"><ImageOff size={32}/><span>No photo available</span></div>}
      </div>
    </Link>
    {children}
    {activeIndex>0&&<button className="carousel-arrow previous" type="button" aria-label="Previous photo" onClick={()=>move(activeIndex-1)}><ChevronLeft size={16}/></button>}
    {activeIndex<listing.image_urls.length-1&&<button className="carousel-arrow next" type="button" aria-label="Next photo" onClick={()=>move(activeIndex+1)}><ChevronRight size={16}/></button>}
    {listing.image_urls.length>1&&<div className={`carousel-dots ${styles.photoDots}`} aria-hidden="true">{listing.image_urls.slice(dotStart,dotStart+5).map((_,i)=>{const photo=dotStart+i;const edge=(i===0&&dotStart>0)||(i===4&&photo<listing.image_urls.length-1);return <span key={photo} className={photo===activeIndex?"active":""} style={{scale:edge?0.67:1}}/>;})}</div>}
  </>;
}
