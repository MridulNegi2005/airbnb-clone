"use client";

import { useRef, useState, type PointerEvent, type ReactNode, type Ref } from "react";
import styles from "./trips.module.css";

export function TripsPanel({ children, panelRef }: { children: ReactNode; panelRef: Ref<HTMLDivElement> }) {
  const [expanded, setExpanded] = useState(false);
  const [dragTop, setDragTop] = useState<number | null>(null);
  const dragged = useRef(false);
  const drag = useRef<{ startY: number; top: number } | null>(null);
  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    dragged.current = false;
    drag.current = { startY: event.clientY, top: expanded ? 12 / window.innerHeight * 100 : 36 };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    if (Math.abs(event.clientY - drag.current.startY) > 4) dragged.current = true;
    setDragTop(Math.min(36, Math.max(12 / window.innerHeight * 100, drag.current.top + (event.clientY - drag.current.startY) / window.innerHeight * 100)));
  }
  function endDrag() {
    if (dragTop !== null) setExpanded(dragTop < 20);
    drag.current = null;
    setDragTop(null);
  }
  return <div ref={panelRef} className={`${styles.sidebar} ${expanded ? styles.expandedSheet : ""} ${dragTop !== null ? styles.draggingSheet : ""}`} style={dragTop !== null ? { transform: `translateY(calc(${dragTop}dvh - 12px))` } : undefined}>
    <button type="button" className={styles.sheetHandle} aria-label={expanded ? "Collapse trip panel" : "Expand trip panel"} aria-expanded={expanded} aria-controls="trip-panel-content"
      onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}
      onClick={() => { if (!dragged.current) setExpanded(value => !value); dragged.current = false; }} onKeyDown={event => { if (event.key === "ArrowUp" || event.key === "ArrowDown") { event.preventDefault(); setExpanded(event.key === "ArrowUp"); } }}><span /></button>
    <div id="trip-panel-content" className={styles.panelContent}>{children}</div>
  </div>;
}
