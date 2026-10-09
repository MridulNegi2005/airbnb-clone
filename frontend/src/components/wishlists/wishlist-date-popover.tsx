"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Modal } from "@/components/ui/modal";

export function WishlistDatePopover({ open, onClose, title, children, footer, className = "", backdropClassName = "" }: ComponentProps<typeof Modal>) {
  const [present, setPresent] = useState(open);
  const panel = useRef<HTMLDivElement>(null);
  const closeHandler = useRef(onClose);
  if (open && !present) setPresent(true);
  useEffect(() => { closeHandler.current = onClose; }, [onClose]);
  useEffect(() => {
    if (open || !present) return;
    const timer = window.setTimeout(() => setPresent(false), window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400);
    return () => window.clearTimeout(timer);
  }, [open, present]);
  useEffect(() => {
    if (!present) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? []).filter(element => element.checkVisibility());
    const frame = requestAnimationFrame(() => focusable()[0]?.focus({ preventScroll: true }));
    function key(event: KeyboardEvent) {
      if (panel.current?.inert) return;
      if (event.key === "Escape") { event.preventDefault(); closeHandler.current(); }
      if (event.key === "Tab") {
        const elements = focusable(), first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", key); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, [present]);
  if (!present) return null;
  return createPortal(<div className={`modal-backdrop ${backdropClassName}`} data-state={open ? "open" : "closing"} onMouseDown={event => { if (open && event.target === event.currentTarget) onClose(); }}><div ref={panel} className={`modal-panel ${className}`} role="dialog" aria-label={title} aria-hidden={!open} inert={!open} tabIndex={-1}><header className="modal-header"><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><X size={16} /></button></header><div className="modal-body">{children}</div>{footer && <footer className="modal-footer">{footer}</footer>}</div></div>, document.body);
}
