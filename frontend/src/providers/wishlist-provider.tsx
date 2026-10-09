"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  const { record: recordRateLimit } = cooldown;
  const activeSession = useRef<string | null>(null);
  const lockedListings = useRef(new Map<number, string>());
  const queuedIntents = useRef(new Map<number, boolean>());
  const lastClicks = useRef(new Map<number, number>());
  const modalPending = useRef<string | null>(null);
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

  const synchronizeSession = useCallback(() => {
    const token = getToken(), changed = activeSession.current !== token;
    if (changed) {
      activeSession.current = token;
      lockedListings.current.clear(); queuedIntents.current.clear(); lastClicks.current.clear();
      modalPending.current = null; needsRefresh.current = false;
      setListingId(null); setPending(false);
    }
    return { token, changed };
  }, []);
  useEffect(() => { if (status !== "authenticated" && !getToken()) synchronizeSession(); }, [status, synchronizeSession]);

  const recordCooldown = useCallback((reason: unknown) => {
    if (reason instanceof ApiError && reason.status === 429) queuedIntents.current.clear();
    recordRateLimit(reason);
  }, [recordRateLimit]);

  const restoreMemberships = useCallback((memberships: SavedListing[]) => {
    client.setQueryData<SavedListing[]>(queryKeys.savedListings, current => {
      const next = [...(current ?? [])];
      for (const item of memberships) {
        if (!next.some(existing => existing.wishlist_id === item.wishlist_id && existing.listing_id === item.listing_id)) next.push(item);
      }
      return next;
    });
  }, [client]);

  const open = useCallback((id: number) => { setListingId(id); setCreate(false); setName(""); setError(""); }, []);

  const remove = useCallback(async (id: number, operationToken: string) => {
    await client.cancelQueries({ queryKey: queryKeys.savedListings });
    if (getToken() !== operationToken) return;
    const memberships = (client.getQueryData<SavedListing[]>(queryKeys.savedListings) ?? []).filter(item => item.listing_id === id);
    if (!memberships.length) { open(id); return; }
    client.setQueryData<SavedListing[]>(queryKeys.savedListings, current => (current ?? []).filter(item => item.listing_id !== id));
    const results = await Promise.allSettled(memberships.map(item => removeWishlist(item.wishlist_id, id)));
    if (getToken() !== operationToken) return;
    restoreMemberships(memberships.filter((_, index) => results[index]?.status === "rejected"));
    needsRefresh.current = true;
    const removed = memberships.filter((_, index) => results[index]?.status === "fulfilled");
    if (removed.length) {
      const names = removed.map(item => client.getQueryData<WishlistSummary[]>(queryKeys.wishlists)?.find(list => list.id === item.wishlist_id)?.name).filter(Boolean);
      toast(`Removed from ${names.length ? names.join(", ") : "your wishlists"}`);
    }
    const failures = results.filter(result => result.status === "rejected");
    const rateLimit = failures.map(result => result.reason).filter((reason): reason is ApiError => reason instanceof ApiError && reason.status === 429).sort((a, b) => b.retryAfterSeconds - a.retryAfterSeconds)[0];
    if (rateLimit) recordCooldown(rateLimit);
    const failure = failures[0];
    if (failure?.status === "rejected") { if (!rateLimit) recordCooldown(failure.reason); toast.error(message(rateLimit ?? failure.reason, "Could not remove this saved place.")); }
  }, [client, open, restoreMemberships, recordCooldown]);

  const release = useCallback(async function release(id: number, operationToken: string) {
    if (lockedListings.current.get(id) !== operationToken) return;
    lockedListings.current.delete(id);
    if (getToken() !== operationToken) { queuedIntents.current.delete(id); return; }
    if (!lockedListings.current.size && needsRefresh.current) {
      needsRefresh.current = false;
      await Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.wishlists }),
        client.invalidateQueries({ queryKey: queryKeys.savedListings }),
      ]);
    }
    if (getToken() !== operationToken || lockedListings.current.has(id) || modalPending.current) return;
    const desired = queuedIntents.current.get(id);
    queuedIntents.current.delete(id);
    if (desired === undefined || cooldown.blocked) return;
    const currentlySaved = (client.getQueryData<SavedListing[]>(queryKeys.savedListings) ?? []).some(item => item.listing_id === id);
    if (!desired) setListingId(current => current === id ? null : current);
    if (desired === currentlySaved) return;
    if (desired) { open(id); return; }
    lockedListings.current.set(id, operationToken);
    try { await remove(id, operationToken); }
    catch (reason) { if (getToken() === operationToken) { recordCooldown(reason); toast.error(message(reason, "Could not remove this saved place.")); } }
    finally { await release(id, operationToken); }
  }, [client, cooldown.blocked, open, remove, recordCooldown]);

  const toggle = useCallback(function toggle(id: number): void {
    if (status !== "authenticated" && !getToken()) { openAuth(() => toggle(id)); return; }
    const { token } = synchronizeSession();
    if (!token || cooldown.blocked || (modalPending.current && !lockedListings.current.has(id))) return;
    const now = performance.now(), last = lastClicks.current.get(id);
    if (last !== undefined && now - last < 300) return;
    lastClicks.current.set(id, now);
    if (lockedListings.current.has(id)) {
      const current = queuedIntents.current.get(id) ?? (client.getQueryData<SavedListing[]>(queryKeys.savedListings) ?? []).some(item => item.listing_id === id);
      queuedIntents.current.set(id, !current);
      return;
    }
    lockedListings.current.set(id, token);
    void (async () => {
      try {
        if (!client.getQueryData<SavedListing[]>(queryKeys.savedListings)) {
          await client.fetchQuery({ queryKey: queryKeys.savedListings, queryFn: ({ signal }) => getSavedListings(signal) });
        }
        if (getToken() !== token) return;
        if (!client.getQueryData<WishlistSummary[]>(queryKeys.wishlists)) {
          await client.fetchQuery({ queryKey: queryKeys.wishlists, queryFn: ({ signal }) => getWishlists(signal) });
        }
        if (getToken() !== token) return;
        await remove(id, token);
      } catch (reason) { if (getToken() === token) { recordCooldown(reason); toast.error(message(reason, "Could not load your wishlists.")); } }
      finally { await release(id, token); }
    })();
  }, [client, cooldown.blocked, status, openAuth, remove, release, recordCooldown, synchronizeSession]);

  async function save(id: number, place: number, listName: string, operationToken: string) {
    await client.cancelQueries({ queryKey: queryKeys.savedListings });
    if (getToken() !== operationToken) return;
    const existed = (client.getQueryData<SavedListing[]>(queryKeys.savedListings) ?? []).some(item => item.wishlist_id === id && item.listing_id === place);
    client.setQueryData<SavedListing[]>(queryKeys.savedListings, current => [...(current ?? []).filter(item => !(item.wishlist_id === id && item.listing_id === place)), { wishlist_id: id, listing_id: place }]);
    try {
      await saveWishlist(id, place);
      if (getToken() !== operationToken) return;
      setListingId(null);
      toast(`Saved to ${listName}`, { action: { label: "Change", onClick: () => { if (getToken() === operationToken) open(place); } } });
    } catch (reason) {
      if (!existed && getToken() === operationToken) client.setQueryData<SavedListing[]>(queryKeys.savedListings, current => (current ?? []).filter(item => !(item.wishlist_id === id && item.listing_id === place)));
      throw reason;
    } finally { if (getToken() === operationToken) needsRefresh.current = true; }
  }

  async function choose(id: number, listName: string) {
    const { token, changed } = synchronizeSession();
    if (!token || changed) return;
    if (listingId === null || modalPending.current || cooldown.blocked || lockedListings.current.has(listingId)) return;
    const place = listingId;
    modalPending.current = token; lockedListings.current.set(place, token); setPending(true); setError("");
    try { await save(id, place, listName, token); }
    catch (reason) { if (getToken() === token) { recordCooldown(reason); setError(message(reason, "Could not save this place.")); toast.error(message(reason, "Could not save this place.")); } }
    finally { if (modalPending.current === token) modalPending.current = null; await release(place, token); if (getToken() === token) setPending(false); }
  }

  async function createAndSave() {
    const { token, changed } = synchronizeSession();
    if (!token || changed) return;
    if (listingId === null || !name.trim() || name.length>50 || modalPending.current || cooldown.blocked || lockedListings.current.has(listingId)) return;
    const place = listingId;
    modalPending.current = token; lockedListings.current.set(place, token); setPending(true); setError("");
    try {
      const list = await createWishlist({ name: name.trim() });
      if (getToken() !== token) return;
      needsRefresh.current = true; setCreate(false);
      await save(list.id, place, list.name, token);
    } catch (reason) { if (getToken() === token) { recordCooldown(reason); setError(message(reason, "Could not create your wishlist.")); toast.error(message(reason, "Could not create your wishlist.")); } }
    finally { if (modalPending.current === token) modalPending.current = null; await release(place, token); if (getToken() === token) setPending(false); }
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

