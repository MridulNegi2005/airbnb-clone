"use client";

import { useEffect, useRef, useState } from "react";
import { AppImage } from "@/components/ui/app-image";
import type { ListingCard } from "@/types/api";
import styles from "./explore.module.css";

export function HomeRowSeeAll({items,title,onBrowse}:{items:ListingCard[];title:string;onBrowse:()=>void}){
  const tile=useRef<HTMLButtonElement>(null);
  const [visible,setVisible]=useState(false);
  useEffect(()=>{
    const element=tile.current;
    if(!element)return;
    const observer=new IntersectionObserver(([entry])=>{if(entry?.isIntersecting&&entry.intersectionRatio===1){setVisible(true);observer.disconnect();}},{root:element.parentElement,rootMargin:"0px -3px",threshold:1});
    observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  const photos=items.flatMap(item=>item.image_urls.slice(0,1)).slice(0,3);
  return <button ref={tile} type="button" className={styles.seeAll} onClick={onBrowse} aria-label={`See all: ${title}`}><span className={styles.seeAllImage}><span className={`${styles.seeAllPhotos} ${visible?styles.seeAllVisible:""}`} aria-hidden="true">{[0,1,2].map(index=><span className={styles.seeAllPhoto} key={index}>{photos[index]&&<AppImage src={photos[index]} alt="" fill sizes="64px"/>}</span>)}</span><strong>See all</strong></span></button>;
}
