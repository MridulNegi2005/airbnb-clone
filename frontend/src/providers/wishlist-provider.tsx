"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, X } from "lucide-react";
import { toast } from "sonner";
import { ApiError, createWishlist, getSavedListings, getWishlists, queryKeys, removeWishlist, saveWishlist } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import type { SavedListing, WishlistSummary } from "@/types/api";
import { Modal } from "@/components/ui/modal";
import { AppImage } from "@/components/ui/app-image";
import { useApiCooldown } from "@/hooks/use-api-cooldown";
import { useAuth } from "./auth-provider";

type WishlistContextValue = { savedIds: Set<number>; toggle: (id: number) => void; isLoading: boolean; isError: boolean; isBlocked: boolean };
const WishlistContext = createContext<WishlistContextValue | null>(null);
const message = (reason: unknown, fallback: string) => reason instanceof Error ? reason.message : fallback;

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { status, openAuth } = useAuth();
  const client = useQueryClient();
  const cooldown = useApiCooldown();
  const lockedListings = useRef(new Set<number>());
  const modalPending = useRef(false);
  const needsRefresh = useRef(false);
  const [listingId, setListingId] = useState<number | null>(null);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const nameInput=useRef<HTMLInputElement>(null),createTrigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(!create||listingId===null)return;const frame=requestAnimationFrame(()=>nameInput.current?.focus({preventScroll:true}));return()=>cancelAnimationFrame(frame);},[create,listingId]);
  const saved = useQuery({ queryKey: queryKeys.savedListings, queryFn: ({ signal }) => getSavedListings(signal), enabled: status === "authenticated" });
  const lists = useQuery({ queryKey: queryKeys.wishlists, queryFn: ({ signal }) => getWishlists(signal), enabled: status === "authenticated" });
  const savedIds = useMemo(() => new Set((saved.data ?? []).map(item => item.listing_id)), [saved.data]);

  async function release(id: number) {
    lockedListings.current.delete(id);
    if (!lockedListings.current.size && needsRefresh.current) {
      needsRefresh.current = false;
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.wishlists }),
        client.invalidateQueries({ queryKey: queryKeys.savedListings }),
      ]);
    }
  }

  function restoreMemberships(memberships: SavedListing[]) {
    client.setQueryData<SavedListing[]>(queryKeys.savedListings, current => {
      const next = [...(current ?? [])];
      for (const item of memberships) {
        if (!next.some(existing => existing.wishlist_id === item.wishlist_id && existing.listing_id === item.listing_id)) next.push(item);
      }
      return next;
    });
  }

  function open(id: number) { setListingId(id); setCreate(false); setName(""); setError(""); }

  async function remove(id: number) {
    await client.cancelQueries({ queryKey: queryKeys.savedListings });
    const memberships = (client.getQueryData<SavedListing[]>(queryKeys.savedListings) ?? []).filter(item => item.listing_id === id);
    if (!memberships.length) { open(id); return; }
    client.setQueryData<SavedListing[]>(queryKeys.savedListings, current => (current ?? []).filter(item => item.listing_id !== id));
    const results = await Promise.allSettled(memberships.map(item => removeWishlist(item.wishlist_id, id)));
    restoreMemberships(memberships.filter((_, index) => results[index]?.status === "rejected"));
    needsRefresh.current = true;
    const removed = memberships.filter((_, index) => results[index]?.status === "fulfilled");
    if (removed.length) {
      const names = removed.map(item => client.getQueryData<WishlistSummary[]>(queryKeys.wishlists)?.find(list => list.id === item.wishlist_id)?.name).filter(Boolean);
      toast(`Removed from ${names.length ? names.join(", ") : "your wishlists"}`);
    }
    const failures = results.filter(result => result.status === "rejected");
    const rateLimit = failures.map(result => result.reason).filter((reason): reason is ApiError => reason instanceof ApiError && reason.status === 429).sort((a, b) => b.retryAfterSeconds - a.retryAfterSeconds)[0];
    if (rateLimit) cooldown.record(rateLimit);
    const failure = failures[0];
    if (failure?.status === "rejected") { if (!rateLimit) cooldown.record(failure.reason); toast.error(message(rateLimit ?? failure.reason, "Could not remove this saved place.")); }
  }

  function toggle(id: number): void {
    if (cooldown.blocked || lockedListings.current.has(id) || modalPending.current) return;
    if (status !== "authenticated" && !getToken()) { openAuth(() => toggle(id)); return; }
    lockedListings.current.add(id);
    void (async () => {
      try {
        if (!client.getQueryData<SavedListing[]>(queryKeys.savedListings)) {
          await client.fetchQuery({ queryKey: queryKeys.savedListings, queryFn: ({ signal }) => getSavedListings(signal) });
        }
        if (!client.getQueryData<WishlistSummary[]>(queryKeys.wishlists)) {
          await client.fetchQuery({ queryKey: queryKeys.wishlists, queryFn: ({ signal }) => getWishlists(signal) });
        }
        await remove(id);
      } catch (reason) { cooldown.record(reason); toast.error(message(reason, "Could not load your wishlists.")); }
      finally { await release(id); }
    })();
  }

  async function save(id: number, place: number, listName: string) {
    await client.cancelQueries({ queryKey: queryKeys.savedListings });
    const existed = (client.getQueryData<SavedListing[]>(queryKeys.savedListings) ?? []).some(item => item.wishlist_id === id && item.listing_id === place);
    client.setQueryData<SavedListing[]>(queryKeys.savedListings, current => [...(current ?? []).filter(item => !(item.wishlist_id === id && item.listing_id === place)), { wishlist_id: id, listing_id: place }]);
    try {
      await saveWishlist(id, place);
      setListingId(null);
      toast(`Saved to ${listName}`, { action: { label: "Change", onClick: () => open(place) } });
    } catch (reason) {
      if (!existed) client.setQueryData<SavedListing[]>(queryKeys.savedListings, current => (current ?? []).filter(item => !(item.wishlist_id === id && item.listing_id === place)));
      throw reason;
    } finally { needsRefresh.current = true; }
  }

  async function choose(id: number, listName: string) {
    if (listingId === null || modalPending.current || cooldown.blocked || lockedListings.current.has(listingId)) return;
    const place = listingId;
    modalPending.current = true; lockedListings.current.add(place); setPending(true); setError("");
    try { await save(id, place, listName); }
    catch (reason) { cooldown.record(reason); setError(message(reason, "Could not save this place.")); toast.error(message(reason, "Could not save this place.")); }
    finally { await release(place); modalPending.current = false; setPending(false); }
  }

  async function createAndSave() {
    if (listingId === null || !name.trim() || name.length>50 || modalPending.current || cooldown.blocked || lockedListings.current.has(listingId)) return;
    const place = listingId;
    modalPending.current = true; lockedListings.current.add(place); setPending(true); setError("");
    try {
      const list = await createWishlist({ name: name.trim() });
      needsRefresh.current = true; setCreate(false);
      await save(list.id, place, list.name);
    } catch (reason) { cooldown.record(reason); setError(message(reason, "Could not create your wishlist.")); toast.error(message(reason, "Could not create your wishlist.")); }
    finally { await release(place); modalPending.current = false; setPending(false); }
  }

  const disabled = pending || cooldown.blocked;
  return <WishlistContext.Provider value={{ savedIds, toggle, isLoading: saved.isLoading, isError: saved.isError, isBlocked: cooldown.blocked }}>
    {children}
    <Modal open={listingId !== null && (status === "authenticated" || Boolean(getToken()))} onClose={() => { if (!modalPending.current) setListingId(null); }} title={create ? "Create wishlist" : "Save to wishlist"} presentation="wishlist" footer={create?<div className="wishlist-dialog-actions"><button className="text-button" type="button" disabled={pending} onClick={() => {if(modalPending.current)return;setCreate(false);requestAnimationFrame(()=>createTrigger.current?.focus({preventScroll:true}));}}>Cancel</button><button className="dark-button" form="wishlist-create-form" type="submit" disabled={disabled||!name.trim()}>{pending?"Creating…":"Create"}</button></div>:<button ref={createTrigger} className="dark-button wishlist-create-trigger" type="button" disabled={disabled} onClick={() => {setCreate(true);setError("");}}>Create new wishlist</button>}>
      {create ? <form id="wishlist-create-form" className="wishlist-name-form" onSubmit={event => { event.preventDefault(); void createAndSave(); }}>
        <div className="wishlist-name-input"><label htmlFor="new-wishlist-name">Name</label><input disabled={pending} ref={nameInput} id="new-wishlist-name" maxLength={50} required value={name} onChange={event => setName(event.target.value)} />{name&&<button type="button" className="icon-button" aria-label="Clear wishlist name" disabled={pending} onClick={()=>{if(modalPending.current)return;setName("");nameInput.current?.focus({preventScroll:true});}}><X size={16}/></button>}</div>
        <span className="muted small">{name.length}/50</span>
      </form> : <>
        {lists.isPending ? <p aria-live="polite">Loading your wishlists…</p> : lists.isError ? <div role="alert"><p>{lists.error.message}</p><button className="text-button" disabled={cooldown.blocked} onClick={() => void lists.refetch()}>Try again</button></div> : <div className="wishlist-picker-grid">
          {lists.data?.map(list => <button key={list.id} type="button" disabled={disabled} className="wishlist-picker-card" onClick={() => void choose(list.id, list.name)}>
            <span className="wishlist-cover">{list.cover_image_url ? <AppImage src={list.cover_image_url} alt="" fill sizes="240px" /> : <Heart size={40} />}</span>
            <strong>{list.name}</strong><span className="muted small">{list.item_count} saved</span>
          </button>)}
        </div>}
      </>}
      {error && <p className="error-text" role="alert" style={{ marginTop: 16 }}>{error}</p>}
    </Modal>
  </WishlistContext.Provider>;
}

export function useWishlistContext() {
  const value = useContext(WishlistContext);
  if (!value) throw new Error("WishlistProvider is missing");
  return value;
}

