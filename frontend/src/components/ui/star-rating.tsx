"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import styles from "./star-rating.module.css";

export function StarRating({ label, value, onChange, large = false, disabled = false }: {
  label: string; value: number; onChange: (value: number) => void; large?: boolean; disabled?: boolean;
}) {
  const id = useId();
  const [hover, setHover] = useState(0);
  const preview = hover || value;
  function keyboard(event: KeyboardEvent<HTMLButtonElement>, current: number) {
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = current === 5 ? 1 : current + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = current === 1 ? 5 : current - 1;
    else if (event.key === "Home") next = 1;
    else if (event.key === "End") next = 5;
    else return;
    event.preventDefault();
    onChange(next);
    document.getElementById(`${id}-${next}`)?.focus();
  }
  return <div className={`${styles.ratingRow} ${large ? styles.overall : ""}`}>
    <span id={`${id}-label`}>{label}</span>
    <div className={styles.stars} role="radiogroup" aria-labelledby={`${id}-label`} onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(star => <button key={star} id={`${id}-${star}`} type="button" role="radio" aria-checked={value === star}
        aria-label={`${star} ${star === 1 ? "star" : "stars"}`} tabIndex={value === star || (value === 0 && star === 1) ? 0 : -1}
        disabled={disabled} onMouseEnter={() => setHover(star)} onFocus={() => setHover(star)} onBlur={() => setHover(0)}
        onClick={() => onChange(star)} onKeyDown={event => keyboard(event, star)}>
        <Star size={large ? 32 : 24} strokeWidth={2} aria-hidden="true" fill={star <= preview ? "currentColor" : "none"} />
      </button>)}
    </div>
  </div>;
}
