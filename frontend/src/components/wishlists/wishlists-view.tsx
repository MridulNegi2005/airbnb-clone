"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ChevronRight, Heart, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { deleteWishlist, getSavedListings, getWishlist, getWishlists, queryKeys, renameWishlist } from "@/lib/api";
import { toDateString } from "@/lib/dates";
import { formatDateRange, plural } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import { AppImage } from "@/components/ui/app-image";
import { ListingCard } from "@/components/listings/listing-card";
import { Modal } from "@/components/ui/modal";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import type { SavedListing, WishlistSummary } from "@/types/api";
import { WishlistDialog } from "./wishlist-dialog";
import styles from "./wishlists.module.css";

const WishlistMap = dynamic(() => import("@/components/maps").then(module => module.WishlistMap), { ssr: false, loading: () => <div className={styles.mapLoading} role="status">Loading map…</div> });
const subscribeDesktop = (notify: () => void) => { const media = window.matchMedia("(min-width:1128px)"); media.addEventListener("change", notify); return () => media.removeEventListener("change", notify); };
const isDesktop = () => window.matchMedia("(min-width:1128px)").matches;
const DatePanel = dynamic(() => import("@/components/search/date-panel").then(module => module.DatePanel), { loading: () => <p role="status">Loading calendar…</p> });
type DialogMode = "settings" | "rename" | "delete" | "dates" | "guests" | null;

export function WishlistsView({ id }: { id?: number }) {
  const { status, openAuth } = useAuth();
  const client = useQueryClient(), router = useRouter(), cooldown = useApiCooldown();
  const prompted = useRef(false), operationPending = useRef(false);
  const [mode, setMode] = useState<DialogMode>(null);
  const [settingsStep, setSettingsStep] = useState<"settings" | "rename" | "delete">("settings");
  const [name, setName] = useState(""), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [dates, setDates] = useState<DateRange>(), [draftDates, setDraftDates] = useState<DateRange>();
  const [guests, setGuests] = useState(1), [draftGuests, setDraftGuests] = useState(1);
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false);
  const lists = useQuery({ queryKey: queryKeys.wishlists, queryFn: ({ signal }) => getWishlists(signal), enabled: status === "authenticated" && id === undefined });
  const detail = useQuery({ queryKey: queryKeys.wishlistDetail(id ?? 0), queryFn: ({ signal }) => getWishlist(id!, signal), enabled: status === "authenticated" && id !== undefined });
  const saved = useQuery({ queryKey: queryKeys.savedListings, queryFn: ({ signal }) => getSavedListings(signal), enabled: status === "authenticated" && id !== undefined });
  useEffect(() => { if (status === "anonymous" && !prompted.current) { prompted.current = true; openAuth(); } }, [status, openAuth]);

  function open(action: DialogMode) {
    if (action === "settings" || action === "rename" || action === "delete") setSettingsStep(action);
    setName(action === "rename" ? detail.data?.name ?? "" : "");
    setDraftDates(dates); setDraftGuests(guests); setError(""); setMode(action);
  }
  function close() { if (!operationPending.current) setMode(null); }
  function backToSettings() { if (!operationPending.current) { setError(""); setSettingsStep("settings"); setMode("settings"); } }
  async function submit() {
    if (operationPending.current || cooldown.blocked || id === undefined || (mode !== "delete" && mode !== "rename") || (mode === "rename" && (!name.trim() || name.trim() === detail.data?.name))) return;
    operationPending.current = true; setPending(true); setError("");
    try {
      if (mode === "delete") {
        await deleteWishlist(id);
        await client.cancelQueries({ queryKey: queryKeys.savedListings });
        await client.cancelQueries({ queryKey: queryKeys.wishlists });
        client.setQueryData<SavedListing[]>(queryKeys.savedListings, current => current?.filter(item => item.wishlist_id !== id));
        client.setQueryData<WishlistSummary[]>(queryKeys.wishlists, current => current?.filter(item => item.id !== id));
        client.removeQueries({ queryKey: queryKeys.wishlistDetail(id), exact: true });
        setMode(null); toast("Wishlist deleted"); router.push("/wishlists");
      } else {
        const updated = await renameWishlist(id, { name: name.trim() });
        await client.cancelQueries({ queryKey: queryKeys.wishlistDetail(id), exact: true });
        await client.cancelQueries({ queryKey: queryKeys.wishlists });
        client.setQueryData(queryKeys.wishlistDetail(id), updated);
        client.setQueryData<WishlistSummary[]>(queryKeys.wishlists, current => current?.map(list => list.id === id ? { ...list, name: updated.name } : list));
        toast("Wishlist renamed"); setMode(null);
      }
      await Promise.all([client.invalidateQueries({ queryKey: queryKeys.wishlists }), client.invalidateQueries({ queryKey: queryKeys.savedListings })]);
    } catch (reason) { cooldown.record(reason); const text = reason instanceof Error ? reason.message : "Could not update your wishlist."; setError(text); toast.error(text); }
    finally { operationPending.current = false; setPending(false); }
  }

  if (status === "loading") return <Loading />;
  if (status === "anonymous") return <section className={styles.page}><h1>Wishlists</h1><div className={styles.empty}><h2>Log in to view your wishlists</h2><p>Save your favourite places and plan your next getaway.</p><button className="dark-button" onClick={() => openAuth()}>Log in</button></div></section>;
  const query = id === undefined ? lists : detail;
  if (query.isPending) return <Loading />;
  if (query.isError) return <section className={styles.page}><h1>Wishlists</h1><div className={styles.empty} role="alert"><h2>We couldn&apos;t load your wishlists</h2><p>{query.error.message}</p><button className="outline-button" onClick={() => void query.refetch()}>Try again</button><Link href="/wishlists" className="text-button">Back to wishlists</Link></div></section>;
  const places = (detail.data?.listings ?? []).filter(listing => saved.data === undefined || saved.data.some(item => item.wishlist_id === id && item.listing_id === listing.id));
  const params = new URLSearchParams({ adults: String(guests) });
  if (dates?.from && dates.to) { params.set("checkin", toDateString(dates.from)); params.set("checkout", toDateString(dates.to)); }
  const dateLabel = dates?.from && dates.to ? formatDateRange(dates.from, dates.to) : "Add dates";

  if (id === undefined) return <section className={styles.page}>
    <header className={styles.heading}><h1>Wishlists</h1></header>
    {lists.data?.length ? <div className={styles.collections}>{lists.data.map((list, index) => <Link href={`/wishlists/${list.id}`} key={list.id} className={styles.collection} aria-label={`Wishlist for ${list.name}, ${list.item_count} saved`}>
      <div className={styles.cover}>{list.cover_image_url ? <AppImage src={list.cover_image_url} alt="" fill priority={index === 0} sizes="(max-width:743px) calc((100vw - 64px)/2), (max-width:1127px) calc((100vw - 144px)/3), 302px" /> : <Heart size={48} />}</div>
      <h2>{list.name}</h2><p>{list.item_count} saved</p>
    </Link>)}</div> : <div className={styles.empty}><h2>Your next trip starts here</h2><p>Tap the heart on a place you love to save it to a wishlist.</p><Link href="/" className="dark-button">Start exploring</Link></div>}
  </section>;

  return <section className={styles.detailPage}>
    <div className={styles.detailPane}>
      <div className={styles.detailControls}><Link href="/wishlists" className="icon-button" aria-label="Back to wishlists"><ArrowLeft size={20} /></Link><button type="button" className="icon-button" aria-label="Wishlist settings" onClick={() => open("settings")}><MoreHorizontal size={20} /></button></div>
      <header className={styles.detailHeading}><h1>{detail.data?.name}</h1></header>
      <div className={styles.filters} aria-label="Travel preferences"><button className={styles.desktopPreference} type="button" onClick={() => open("dates")} aria-haspopup="dialog">{dateLabel}</button><button className={styles.desktopPreference} type="button" onClick={() => open("guests")} aria-haspopup="dialog">{plural(guests, "guest")}</button><button className={styles.mobilePreference} type="button" onClick={() => open("dates")} aria-haspopup="dialog">{dates?.from && dates.to ? dateLabel : "Dates"} · {plural(guests, "guest")}</button></div>
      {places.length ? <div><h2 className="sr-only">Saved stays</h2><div className={`listing-grid ${styles.grid}`}>{places.map((listing, index) => <ListingCard key={listing.id} listing={listing} priority={index === 0} searchParams={params.toString()} imageSizes="(max-width:743px) calc(100vw - 48px), (max-width:1127px) calc((100vw - 72px)/2), calc((63vw - 96px)/3)" />)}</div></div> : <div className={styles.empty}><h2>Find a place you love</h2><p>Your saved places will appear here.</p><Link href="/" className="dark-button">Start exploring</Link></div>}
    </div>
    {places.length > 0 && desktop && <aside className={styles.map} aria-label="Saved places map"><WishlistMap listings={places} /></aside>}
    <WishlistDialog open={mode === "settings" || mode === "rename" || mode === "delete"} title={settingsStep === "settings" ? "Settings" : settingsStep === "rename" ? "Rename wishlist" : "Delete this wishlist?"} onClose={close} onBack={settingsStep === "rename" || settingsStep === "delete" ? backToSettings : undefined}
      footer={settingsStep === "rename" || settingsStep === "delete" ? <><button type="button" className="text-button" disabled={pending} onClick={backToSettings}>Cancel</button><button type={settingsStep === "rename" ? "submit" : "button"} form={settingsStep === "rename" ? "rename-wishlist-form" : undefined} className="dark-button" disabled={pending || cooldown.blocked || (settingsStep === "rename" && (!name.trim() || name.trim() === detail.data?.name))} onClick={settingsStep === "delete" ? () => void submit() : undefined}>{pending ? settingsStep === "delete" ? "Deleting…" : "Saving…" : settingsStep === "rename" ? "Save" : "Delete"}</button></> : undefined}>
      {settingsStep === "settings" ? <div className={styles.settingsRows}><button type="button" onClick={() => open("rename")}><Pencil size={18} /><span>Rename</span><ChevronRight size={18} /></button><button type="button" onClick={() => open("delete")}><Trash2 size={18} /><span>Delete</span><ChevronRight size={18} /></button></div> : settingsStep === "delete" ? <p className={styles.deleteMessage}>“{detail.data?.name}” will be permanently deleted. Places saved in your other wishlists will stay there.</p> : <form id="rename-wishlist-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
        <div className={styles.nameField}><label htmlFor="wishlist-name">Name</label><input id="wishlist-name" required maxLength={50} value={name} onChange={event => setName(event.target.value)} aria-describedby="wishlist-name-count" /><button type="button" aria-label="Clear name" onClick={() => setName("")}><X size={14} /></button></div><p id="wishlist-name-count" className={styles.counter}>{name.length}/50 characters</p>
      </form>}
      {error && <p className="error-text" role="alert">{error}</p>}
    </WishlistDialog>
    <Modal open={mode === "dates"} title="Add dates" width={720} onClose={close} footer={<div className={styles.filterFooter}><button className="text-button" type="button" onClick={close}>Cancel</button><button className="dark-button" type="button" disabled={Boolean(draftDates?.from && !draftDates.to)} onClick={() => { setDates(draftDates); setGuests(draftGuests); setMode(null); }}>Save</button></div>}>
      {mode === "dates" && <><DatePanel value={draftDates} onChange={setDraftDates} /><div className={`${styles.guestRow} ${styles.mobileDateGuests}`}><strong>Guests</strong><div className="stepper"><button type="button" aria-label="Remove guest" disabled={draftGuests <= 1} onClick={() => setDraftGuests(value => value - 1)}>−</button><span aria-live="polite">{draftGuests}</span><button type="button" aria-label="Add guest" disabled={draftGuests >= 16} onClick={() => setDraftGuests(value => value + 1)}>+</button></div></div></>}
    </Modal>
    <WishlistDialog open={mode === "guests"} title="Guests" onClose={close} footer={<><button className="text-button" type="button" onClick={close}>Cancel</button><button className="dark-button" type="button" onClick={() => { setGuests(draftGuests); setMode(null); }}>Save</button></>}>
      <div className={styles.guestRow}><div><strong>Guests</strong><p>Ages 2 or above</p></div><div className="stepper"><button type="button" aria-label="Remove guest" disabled={draftGuests <= 1} onClick={() => setDraftGuests(value => value - 1)}>−</button><span aria-live="polite">{draftGuests}</span><button type="button" aria-label="Add guest" disabled={draftGuests >= 16} onClick={() => setDraftGuests(value => value + 1)}>+</button></div></div>
    </WishlistDialog>
  </section>;
}
function Loading() {
  return <section className={styles.page} aria-busy="true"><header className={styles.heading}><h1>Wishlists</h1></header><div className={styles.collections}>{[0, 1, 2].map(item => <div key={item}><div className={`skeleton ${styles.coverSkeleton}`} /><div className="skeleton" style={{ marginTop: 16, width: 140 }} /></div>)}</div></section>;
}
