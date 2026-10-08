"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import styles from "./wishlists.module.css";

export function WishlistDialog({ open, title, onClose, onBack, children, footer, width = 375 }: {
  open: boolean; title: string; onClose: () => void; onBack?: () => void;
  children: ReactNode; footer?: ReactNode; width?: number;
}) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => button.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, title]);
  return <Modal open={open} title={title} onClose={onClose} width={width}>
    <div className={styles.dialogContent}>
      <header className={styles.dialogHeading}>
        <button ref={button} type="button" className={`icon-button ${onBack ? styles.dialogBack : styles.dialogClose}`} aria-label={onBack ? "Back" : "Close"} onClick={onBack ?? onClose}>
          {onBack ? <ArrowLeft size={20} /> : <X size={18} />}
        </button>
        <h2 aria-hidden="true">{title}</h2>
      </header>
      <div className={styles.dialogBody}>{children}</div>
      {footer && <footer className={styles.dialogFooter}>{footer}</footer>}
    </div>
  </Modal>;
}
