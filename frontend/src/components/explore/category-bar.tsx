"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";
import { getAmenities } from "@/lib/api";
import { useSearch } from "@/hooks/use-search";
import styles from "./explore.module.css";

export function CategoryBar({onFilters}:{onFilters:()=>void}) {
  const {params,update}=useSearch();
  const amenities=useQuery({queryKey:["amenities"],queryFn:({signal})=>getAmenities(signal)});
  const container=useRef<HTMLDivElement>(null);
  const [overflow,setOverflow]=useState({left:false,right:false});
  const count=["min_price","max_price","place_type","bedrooms","beds","bathrooms","property_types","amenities","category"].filter(key=>params.has(key)).length;
  const saved=params.get("amenities")?.split(",").filter(Boolean)??[];
  const names=["Free parking","Self check-in","Wifi","Air conditioning","TV","Kitchen","Pool"];
  const ordered=(amenities.data??[]).filter(amenity=>names.some(name=>name.toLowerCase()===amenity.name.toLowerCase())).sort((a,b)=>names.findIndex(name=>name.toLowerCase()===a.name.toLowerCase())-names.findIndex(name=>name.toLowerCase()===b.name.toLowerCase()));
  const choices=ordered.length?ordered:(amenities.data??[]).slice(0,7);
  useEffect(()=>{
    const element=container.current;if(!element)return;
    const check=()=>setOverflow({left:element.scrollLeft>2,right:element.scrollLeft+element.clientWidth<element.scrollWidth-2});
    check();element.addEventListener("scroll",check,{passive:true});const observer=new ResizeObserver(check);observer.observe(element);
    return()=>{element.removeEventListener("scroll",check);observer.disconnect();};
  },[amenities.data]);
  function move(direction:number){const element=container.current;element?.scrollBy({left:direction*element.clientWidth*.8,behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});}
  return <div className={styles.categoryWrap}><nav className={`${styles.categoryBar} ${styles.resultsFilters}`} aria-label="Filter stays">
    <button className={styles.filters} onClick={onFilters}><SlidersHorizontal size={16}/><span>Filters</span>{count>0&&<span className={styles.filterBadge}>{count}</span>}</button>
    {overflow.left&&<button className={styles.arrow} aria-label="Previous filters" onClick={()=>move(-1)}><ChevronLeft size={16}/></button>}
    <div className={styles.categories} ref={container}>
      {amenities.isPending&&Array.from({length:6},(_,index)=><span key={index} className={`skeleton ${styles.filterSkeleton}`}/>)}
      {amenities.isError&&<p className={styles.categoryError}>Filters could not be loaded.<button onClick={()=>void amenities.refetch()}>Try again</button></p>}
      {choices.map(amenity=>{const id=String(amenity.id),selected=saved.includes(id);return <button key={amenity.id} className={styles.quickFilter} aria-pressed={selected} onClick={()=>update({amenities:(selected?saved.filter(value=>value!==id):[...saved,id]).join(",")||undefined})}>{amenity.name}</button>;})}
    </div>
    {overflow.right&&<button className={styles.arrow} aria-label="Next filters" onClick={()=>move(1)}><ChevronRight size={16}/></button>}
  </nav></div>;
}
