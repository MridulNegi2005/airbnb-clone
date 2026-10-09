"use client";

import { AppImage as Image } from "@/components/ui/app-image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Grid2X2, Heart, Share, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./detail.module.css";

type Props = { images: string[]; title: string; saved: boolean; onSave: () => void; onShare: () => void; saveDisabled?: boolean };

export function PhotoGallery({ images, title, saved, onSave, onShare, saveDisabled = false }: Props) {
  const [tour, setTour] = useState(false);
  const [present, setPresent] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [closingViewer, setClosingViewer] = useState<number | null>(null);
  const [slide, setSlide] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const carousel = useRef<HTMLDivElement>(null);
  const [viewerOpener, setViewerOpener] = useState<number | null>(null);
  const viewerIndex = useRef<number | null>(null);
  const viewer = lightbox !== null;

  useEffect(() => { viewerIndex.current = lightbox; }, [lightbox]);

  useEffect(() => {
    if (closingViewer === null) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150;
    const timer = window.setTimeout(() => setClosingViewer(null), duration);
    return () => window.clearTimeout(timer);
  }, [closingViewer]);

  useEffect(() => {
    if (tour || !present) return;
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150;
    const timer = window.setTimeout(() => setPresent(false), duration);
    return () => window.clearTimeout(timer);
  }, [tour, present]);

  useEffect(() => {
    if (!present) return;
    const previous = document.documentElement.style.overflow;
    const previousPadding = document.documentElement.style.paddingRight;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    if (gap > 0) document.documentElement.style.paddingRight = `${parseFloat(getComputedStyle(document.documentElement).paddingRight) + gap}px`;
    document.documentElement.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => {
      if (panel.current?.inert) {
        if (["Tab", "Escape", "ArrowRight", "ArrowLeft"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }
      if (document.activeElement && !panel.current?.contains(document.activeElement)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (viewerIndex.current !== null) { setClosingViewer(viewerIndex.current); setLightbox(null); }
        else setTour(false);
      }
      if (viewerIndex.current !== null && ["ArrowRight", "ArrowLeft"].includes(event.key)) {
        event.preventDefault();
        setLightbox(index => index === null ? null : Math.max(0, Math.min(images.length - 1, index + (event.key === "ArrowRight" ? 1 : -1))));
      }
      if (event.key === "Tab") {
        const controls = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]') ?? []).filter((element) => element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.documentElement.style.overflow = previous;
      document.documentElement.style.paddingRight = previousPadding;
      document.removeEventListener("keydown", keydown, true);
      if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
    };
  }, [present, images.length]);

  useEffect(() => {
    if (!present) return;
    const frame = requestAnimationFrame(() => {
      const photo = !viewer && viewerOpener !== null ? document.getElementById(`tour-photo-${viewerOpener}`) : null;
      const opener = photo && panel.current?.contains(photo) ? photo : null;
      (viewer ? panel.current : opener ?? panel.current?.querySelector<HTMLButtonElement>("button"))?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [present, viewer, viewerOpener]);

  function openTour(index?: number) {
    trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setViewerOpener(null);
    setClosingViewer(null);
    setLightbox(index ?? null);
    setPresent(true);
    setTour(true);
  }

  function moveSlide(direction: number) {
    const next = Math.max(0, Math.min(images.length - 1, slide + direction));
    carousel.current?.children[next]?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "nearest", inline: "start" });
  }

  function closeViewer() { setClosingViewer(lightbox); setLightbox(null); }

  function openViewer(index: number) { setViewerOpener(index); setLightbox(index); }

  function renderPanel(index: number | null, closing = false) {
    return <div key={index !== null ? "viewer" : "tour"} className={`${styles.photoTour} ${index !== null ? styles.lightbox : ""}`} data-state={closing || !tour ? "closing" : "open"} ref={closing ? undefined : panel} tabIndex={-1} role="dialog" aria-modal={tour && !closing} aria-hidden={!tour || closing} inert={!tour || closing} aria-label={index !== null ? "Photo viewer" : "Photo tour"}>
      <div className={styles.tourHeader}><button aria-label={index !== null ? "Close photo viewer" : "Close photo tour"} onClick={() => index !== null ? closeViewer() : setTour(false)}>{index !== null ? <X size={20} /> : <ChevronLeft size={20} />}{index !== null && <span>Close</span>}</button>{index !== null ? <span aria-live="polite">{index + 1} / {images.length}</span> : <span />}<div><button onClick={onShare}><Share size={16} />Share</button><button onClick={onSave} aria-pressed={saved} disabled={saveDisabled}><Heart size={16} fill={saved ? "var(--brand)" : "none"} />{saved ? "Saved" : "Save"}</button></div></div>
      {index !== null && images[index] ? <div className={styles.lightboxBody}><button aria-label="Previous photo" disabled={index === 0} onClick={() => setLightbox(Math.max(0, index - 1))}><ChevronLeft size={12} /></button><div className={styles.lightboxImage} key={index}><Image src={images[index]} alt={`Photo ${index + 1} of ${title}`} fill sizes="90vw" /></div><button aria-label="Next photo" disabled={index === images.length - 1} onClick={() => setLightbox(Math.min(images.length - 1, index + 1))}><ChevronRight size={12} /></button></div> : <div className={styles.tourContent}><h2>Photo tour</h2><nav className={styles.tourThumbnails} aria-label="Photo tour navigation">{images.map((url,index)=><button key={`thumb-${index}`} onClick={()=>document.getElementById(`tour-photo-${index}`)?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth",block:"start"})}><span><Image src={url} alt="" fill sizes="148px" /></span>Photo {index+1}</button>)}</nav><div className={styles.tourPhotos}><h3>Photos</h3><div className={styles.tourGrid}>{images.map((url, index) => <button id={`tour-photo-${index}`} key={`${url}-${index}`} onClick={() => openViewer(index)} aria-label={`View photo ${index + 1}`}><Image src={url} alt={`Photo ${index + 1} of ${title}`} fill sizes="(max-width: 744px) 100vw, 744px" /></button>)}</div></div></div>}
    </div>;
  }

  return <>
    <div id="photos" className={`${styles.mosaic} ${images.length < 5 ? styles.smallMosaic : ""}`} data-count={Math.min(images.length, 5)}>
      {images.length ? images.slice(0, 5).map((url, index) => <button key={`${url}-${index}`} className={styles.mosaicPhoto} aria-label={`Open photo ${index + 1} of ${title}`} onClick={() => openTour(index)}>
        <Image src={url} alt={`Photo ${index + 1} of ${title}`} fill sizes={index === 0 ? "(min-width: 950px) 560px, 100vw" : "280px"} priority={index === 0} />
      </button>) : <div className={styles.noPhotos}>Photos are not available for this stay.</div>}
      {images.length > 0 && <button className={styles.allPhotos} onClick={() => openTour()}><Grid2X2 size={16} aria-hidden="true" />Show all photos</button>}
    </div>
    <div className={styles.mobileGallery}>
      <div className={styles.mobilePhotos} ref={carousel} onScroll={() => { if (carousel.current) setSlide(Math.round(carousel.current.scrollLeft / carousel.current.clientWidth)); }} aria-roledescription="carousel" aria-label="Listing photos">
        {images.map((url, index) => <button key={`${url}-${index}`} className={styles.mobilePhoto} onClick={() => openTour(index)} aria-label={`Open photo ${index + 1} of ${images.length}`}><Image src={url} alt={`Photo ${index + 1} of ${title}`} fill sizes="(max-width: 949px) 100vw, 1px" priority={index === 0} /></button>)}
        {!images.length && <div className={styles.noPhotos}>Photos are not available.</div>}
      </div>
      <div className={styles.mobilePhotoActions}><Link href="/" aria-label="Back to explore"><ChevronLeft size={20} /></Link><span /><button aria-label="Share listing" onClick={onShare}><Share size={18} /></button><button aria-label={saved ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={saved} disabled={saveDisabled} onClick={onSave}><Heart size={18} fill={saved ? "var(--brand)" : "none"} /></button></div>
      {images.length > 1 && <><button className={styles.mobilePrevious} aria-label="Previous listing photo" disabled={slide === 0} onClick={() => moveSlide(-1)}><ChevronLeft size={18} /></button><button className={styles.mobileNext} aria-label="Next listing photo" disabled={slide === images.length - 1} onClick={() => moveSlide(1)}><ChevronRight size={18} /></button></>}
      {images.length > 0 && <button className={styles.photoCounter} onClick={() => openTour(slide)}>{slide + 1} / {images.length}</button>}
    </div>
    {present && createPortal(<>{renderPanel(lightbox)}{closingViewer !== null && renderPanel(closingViewer, true)}</>, document.body)}
  </>;
}
