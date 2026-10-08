"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, Building2, Castle, ChevronLeft, ChevronRight, Coffee, Home, Landmark, Mountain, Orbit, Palette, Palmtree, SlidersHorizontal, Snowflake, Tent, TreePine, TrendingUp, Waves } from "lucide-react";
import { getCategories } from "@/lib/api";
import { useSearch } from "@/hooks/use-search";
import styles from "./explore.module.css";

const icons = { beach: Palmtree, beachfront: Waves, pool: Waves, mountain: Mountain, "mountain-view": Mountain, countryside: TreePine, cabin: TreePine, cabins: TreePine, camping: Tent, castle: Castle, castles: Castle, apartment: Building2, city: Building2, room: BedDouble, breakfast: Coffee, "palm-tree": Palmtree, lake: Waves, design: Palette, mansion: Landmark, ufo: Orbit, ski: Snowflake, "tiny-home": Home, trending: TrendingUp };

export function CategoryBar({ onFilters }: { onFilters: () => void }) {
  const { params, update } = useSearch();
  const categories = useQuery({ queryKey: ["categories"], queryFn: ({ signal }) => getCategories(signal) });
  const container = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const count = ["min_price", "max_price", "place_type", "bedrooms", "beds", "bathrooms", "property_types", "amenities"].filter((key) => params.has(key)).length;
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const check = () => setOverflow({ left: element.scrollLeft > 2, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2 });
    check();
    element.addEventListener("scroll", check, { passive: true });
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", check); observer.disconnect(); };
  }, [categories.data]);
  const scroll = (direction: number) => {
    const element = container.current;
    element?.scrollBy({ left: direction * element.clientWidth * .8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };
  return <div className={styles.categoryWrap}><nav className={styles.categoryBar} aria-label="Stay categories">
    {overflow.left && <button className={styles.arrow} aria-label="Previous categories" onClick={() => scroll(-1)}><ChevronLeft size={16} /></button>}
    <div className={styles.categories} ref={container}>
      {categories.isPending && Array.from({ length: 8 }, (_, index) => <div key={index} className="skeleton my-4 h-12 w-16 shrink-0 rounded-lg" />)}
      {categories.isError && <p className={styles.categoryError}>Categories could not be loaded.<button onClick={() => void categories.refetch()}>Try again</button></p>}
      {categories.data?.map((category) => {
        const Icon = icons[category.icon as keyof typeof icons] ?? Home;
        const active = params.get("category") === category.slug;
        return <a key={category.id} href={`/?${new URLSearchParams({ ...Object.fromEntries(params), category: category.slug })}`} aria-current={active ? "page" : undefined} className={`${styles.category} ${active ? styles.activeCategory : ""}`} onClick={(event) => { event.preventDefault(); update({ category: active ? undefined : category.slug }); }}><Icon size={24} strokeWidth={2} aria-hidden="true" /><span>{category.name}</span></a>;
      })}
    </div>
    {overflow.right && <button className={styles.arrow} aria-label="Next categories" onClick={() => scroll(1)}><ChevronRight size={16} /></button>}
    <button className={styles.filters} onClick={onFilters}><SlidersHorizontal size={16} /><span>Filters</span>{count > 0 && <span className={styles.filterBadge}>{count}</span>}</button>
  </nav></div>;
}
