"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, MessageCircle, Send, AlertCircle, Search, X } from "lucide-react";
import { ApiError, getBookings, getConversations, getHostBookings, getListing, getMessages, markConversationRead, queryKeys, sendMessage } from "@/lib/api";
import { formatDateRange, formatPrice } from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import { usePageVisible } from "@/hooks/use-unread-count";
import { AppImage } from "@/components/ui/app-image";
import type { ConversationSummary, HostBooking, Message } from "@/types/api";
import styles from "./messages.module.css";
import { useSendCooldown } from "./use-send-cooldown";

function Avatar({ user, small = false }: { user: ConversationSummary["other_user"]; small?: boolean }) {
  return <span className={`${styles.avatar} ${small ? styles.smallAvatar : ""}`}>{user.avatar_url ? <AppImage src={user.avatar_url} alt="" fill sizes={small ? "32px" : "48px"}/> : user.name.slice(0, 1)}</span>;
}
function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className={styles.centerState}><AlertCircle size={32}/><h2>We couldn’t load your messages</h2><p role="alert">{message}</p>{retry && <button className="outline-button" onClick={retry}>Try again</button>}</div>;
}
export function InboxSkeleton() {
  return <div className={styles.inbox} aria-busy="true" aria-label="Loading messages"><aside className={styles.list}><h1>Messages</h1>{Array.from({ length: 5 }, (_, i) => <div key={i} className={`${styles.row} skeleton`} style={{ height: 80, margin: 16 }}/>)}</aside><div className={styles.centerState}><MessageCircle size={40}/><p>Loading your inbox…</p></div></div>;
}

export function InboxView({ conversationId }: { conversationId?: number }) {
  const { user, status, openAuth } = useAuth();
  const visible = usePageVisible();
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const conversations = useQuery({ queryKey: queryKeys.conversations, queryFn: ({ signal }) => getConversations(signal), enabled: status === "authenticated", refetchInterval: query => visible && !(query.state.error instanceof ApiError && query.state.error.status === 429) ? 30_000 : false });
  const selected = conversations.data?.find(item => item.id === conversationId);
  const filtered = conversations.data?.filter(item => `${item.other_user.name} ${item.listing.title} ${item.last_message?.body ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  if (status === "loading") return <InboxSkeleton/>;
  if (status === "anonymous") return <div className={styles.auth}><MessageCircle size={48}/><h1>Messages</h1><p>Log in to read your messages and connect with your hosts.</p><button className="dark-button" onClick={() => openAuth()}>Log in</button></div>;
  return <div className={`${styles.inbox} ${conversationId !== undefined ? styles.withThread : ""} ${selected && detailsOpen ? styles.withDetails : ""}`}>
    <aside className={styles.list}><header><h1>Messages</h1><button type="button" className={styles.headerAction} aria-label={searchOpen ? "Close search" : "Search messages"} aria-expanded={searchOpen} onClick={() => { setSearchOpen(value => !value); setSearch(""); }}>{searchOpen ? <X size={20}/> : <Search size={20}/>}</button>{searchOpen && <label className={styles.inboxSearch}><span className="sr-only">Search conversations</span><input autoFocus placeholder="Search messages" value={search} onChange={event => setSearch(event.target.value)}/></label>}</header>{conversations.isPending ? <p className={styles.listNotice}>Loading conversations…</p> : conversations.isError ? <ErrorState message={conversations.error.message} retry={() => { void conversations.refetch(); }}/> : conversations.data?.length === 0 ? <div className={styles.emptyList}><h2>Nothing to see here</h2><p>Plan a stay to connect with your host here.</p><Link href="/" className="outline-button">Get started</Link></div> : <nav aria-label="Conversations">{filtered?.map(conversation => <Link key={conversation.id} href={`/messages/${conversation.id}`} aria-current={selected?.id === conversation.id ? "page" : undefined} className={`${styles.row} ${conversation.unread_count > 0 ? styles.unread : ""}`}><span className={styles.conversationPhoto}>{conversation.listing.cover_image_url ? <AppImage src={conversation.listing.cover_image_url} alt="" fill sizes="64px"/> : <Avatar user={conversation.other_user}/>}<span className={styles.conversationAvatar}><Avatar user={conversation.other_user} small/></span></span><div className={styles.preview}><div className={styles.previewTop}><strong>{conversation.other_user.name}</strong><time dateTime={conversation.last_message_at}>{new Date(conversation.last_message_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</time></div><p>{conversation.last_message?.body || "Start a conversation"}</p><span>{conversation.listing.title}</span></div>{conversation.unread_count > 0 && <i className={styles.dot} aria-label={`${conversation.unread_count} unread messages`}/>}</Link>)}{filtered?.length === 0 && <p className={styles.listNotice}>No conversations match your search.</p>}</nav>}</aside>
    {selected && user ? <ConversationThread key={selected.id} conversation={selected} userId={user.id} detailsOpen={detailsOpen} mobileDetailsOpen={mobileDetailsOpen} onToggleDetails={() => { if (window.matchMedia("(max-width: 743px)").matches) setMobileDetailsOpen(true); else setDetailsOpen(value => !value); }}/> : conversationId !== undefined && !conversations.isPending ? <div className={styles.thread}><Link href="/messages" className={styles.back}><ArrowLeft size={20}/> All messages</Link><ErrorState message={conversations.isError ? conversations.error.message : "This conversation is unavailable or you do not have access to it."}/></div> : <div className={styles.emptyThread} aria-label="No conversation selected"/>}
    {selected && (detailsOpen || mobileDetailsOpen) && <ConversationDetails conversation={selected} mobileOpen={mobileDetailsOpen} onClose={() => { setMobileDetailsOpen(false); setDetailsOpen(false); }}/>}
  </div>;
}

type PendingMessage = Message & { failed: boolean; pending: boolean; error?: string };
function messageDay(createdAt: string) {
  return new Date(createdAt).toLocaleDateString("en-CA");
}
function mergeMessages(existing: Message[], incoming: Message[]) {
  return [...new Map([...existing, ...incoming].map(message => [message.id, message])).values()].sort((a, b) => a.id - b.id);
}
function ConversationThread({ conversation, userId, detailsOpen, mobileDetailsOpen, onToggleDetails }: { conversation: ConversationSummary; userId: number; detailsOpen: boolean; mobileDetailsOpen: boolean; onToggleDetails: () => void }) {
  const client = useQueryClient();
  const visible = usePageVisible();
  const messageKey = queryKeys.messages(conversation.id);
  const messages = useQuery({ queryKey: messageKey, queryFn: ({ signal }) => getMessages(conversation.id, { limit: 50 }, signal), staleTime: Infinity });
  const [draft, setDraft] = useState("");
  const [pendingMessages, setPendingMessages] = useState<PendingMessage[]>([]);
  const [olderPending, setOlderPending] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [olderError, setOlderError] = useState("");
  const [pollError, setPollError] = useState("");
  const [pollingPaused, setPollingPaused] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(-1);
  const initialScroll = useRef(false);
  const followLatest = useRef(true);
  const cooldown = useSendCooldown();
  const sending = pendingMessages.some(message => message.pending);
  const serverMessages = messages.data ?? [];
  const messagesLoaded = messages.data !== undefined;

  useEffect(() => {
    if (!messages.data) return;
    const element = viewport.current;
    if (element && (!initialScroll.current || followLatest.current)) { element.scrollTop = element.scrollHeight; initialScroll.current = true; }
  }, [messages.data, pendingMessages]);
  useEffect(() => {
    const element = textarea.current;
    if (element) { element.style.height = "auto"; element.style.height = `${Math.min(element.scrollHeight, 160)}px`; }
  }, [draft]);
  useEffect(() => {
    if (!visible || !messagesLoaded || pollingPaused) return;
    let active = true;
    const controller = new AbortController();
    async function markRead() {
      try {
        await markConversationRead(conversation.id);
        if (!active) return;
        client.setQueryData<ConversationSummary[]>(queryKeys.conversations, current => current?.map(item => item.id === conversation.id ? { ...item, unread_count: 0 } : item));
        await Promise.all([client.invalidateQueries({ queryKey: queryKeys.unreadCount }), client.invalidateQueries({ queryKey: queryKeys.conversations })]);
      } catch { /* Polling will try again when another message arrives. */ }
    }
    void markRead();
    let busy = false;
    const timer = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const latest = client.getQueryData<Message[]>(queryKeys.messages(conversation.id));
        const incoming = await getMessages(conversation.id, { after_id: latest?.at(-1)?.id ?? 0, limit: 100 }, controller.signal);
        if (!active) return;
        setPollError("");
        if (incoming.length) {
          client.setQueryData<Message[]>(queryKeys.messages(conversation.id), current => mergeMessages(current ?? [], incoming));
          void markRead();
        }
      } catch (error) { if (active && !controller.signal.aborted) { setPollError(error instanceof Error ? error.message : "Connection lost. We’ll keep trying."); if (error instanceof ApiError && error.status === 429) setPollingPaused(true); } }
      finally { busy = false; }
    }, 5000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [client, conversation.id, visible, messagesLoaded, pollingPaused]);

  async function loadOlder() {
    if (olderPending || !hasOlder || !serverMessages.length) return;
    setOlderPending(true); setOlderError("");
    const element = viewport.current;
    const oldHeight = element?.scrollHeight ?? 0;
    const oldTop = element?.scrollTop ?? 0;
    try {
      const older = await getMessages(conversation.id, { before_id: serverMessages[0]?.id, limit: 50 });
      setHasOlder(older.length === 50);
      followLatest.current = false;
      client.setQueryData<Message[]>(messageKey, current => mergeMessages(current ?? [], older));
      requestAnimationFrame(() => { if (element) element.scrollTop = oldTop + element.scrollHeight - oldHeight; });
    } catch (error) { setOlderError(error instanceof Error ? error.message : "Couldn’t load older messages."); }
    finally { setOlderPending(false); }
  }
  async function deliver(message: PendingMessage) {
    if (cooldown.blocked) return;
    setPendingMessages(current => current.map(item => item.id === message.id ? { ...item, pending: true, failed: false, error: undefined } : item));
    try {
      const saved = await sendMessage(conversation.id, { body: message.body });
      client.setQueryData<Message[]>(messageKey, current => mergeMessages(current ?? [], [saved]));
      setPendingMessages(current => current.filter(item => item.id !== message.id));
      void client.invalidateQueries({ queryKey: queryKeys.conversations });
    } catch (error) { cooldown.record(error); setPendingMessages(current => current.map(item => item.id === message.id ? { ...item, pending: false, failed: true, error: error instanceof Error ? error.message : "Message not sent" } : item)); }
  }
  function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!draft.trim() || sending || cooldown.blocked) return;
    const optimistic: PendingMessage = { id: nextId.current--, sender_id: userId, body: draft.trim(), created_at: new Date().toISOString(), failed: false, pending: true };
    followLatest.current = true;
    setPendingMessages(current => [...current, optimistic]); setDraft(""); void deliver(optimistic);
  }
  const allMessages = [...serverMessages, ...pendingMessages];
  return <section className={styles.thread} aria-label={`Conversation with ${conversation.other_user.name}`}><header className={styles.threadHeader}><Link className={styles.mobileBack} href="/messages" aria-label="Back to messages"><ArrowLeft size={22}/></Link><Link href={`/users/${conversation.other_user.id}`} className={styles.threadIdentity}><Avatar user={conversation.other_user}/><div><h2>{conversation.other_user.name}</h2><span>{conversation.role === "guest" ? "Host" : "Guest"}</span></div></Link><button type="button" className={`${styles.headerAction} ${styles.desktopDetailsToggle}`} aria-label="Conversation details" aria-expanded={detailsOpen} onClick={onToggleDetails}><ChevronRight size={20}/></button><button type="button" className={`${styles.headerAction} ${styles.mobileDetailsToggle}`} aria-label="Conversation details" aria-expanded={mobileDetailsOpen} onClick={onToggleDetails}><ChevronRight size={20}/></button></header>
    <div className={styles.messageScroll} ref={viewport} onScroll={() => { const element = viewport.current; if (!element) return; followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; if (element.scrollTop < 48 && initialScroll.current) void loadOlder(); }} aria-live="polite">
      {messages.isPending ? <p className={styles.listNotice}>Loading messages…</p> : messages.isError ? <ErrorState message={messages.error.message} retry={() => { void messages.refetch(); }}/> : <>{hasOlder && serverMessages.length >= 50 && <button className={styles.loadOlder} disabled={olderPending} onClick={() => { void loadOlder(); }}>{olderPending ? "Loading…" : "Load earlier messages"}</button>}{olderError && <p role="alert" className="error-text">{olderError}<button className="text-button" onClick={() => { void loadOlder(); }}>Try again</button></p>}{allMessages.length === 0 && <p className={styles.listNotice}>Say hello to {conversation.other_user.name.split(" ")[0]}.</p>}{allMessages.map((message, index) => { const own = message.sender_id === userId; const day = messageDay(message.created_at); const previous = allMessages[index - 1]; const newDay = !previous || messageDay(previous.created_at) !== day; const grouped = !newDay && previous?.sender_id === message.sender_id; const temporary = message.id < 0 ? pendingMessages.find(item => item.id === message.id) : undefined; const timestamp = new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }); return <div key={message.id} className={temporary?.pending ? styles.enteringMessage : undefined}>{newDay && <div className={styles.day}>{new Date(message.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", ...(new Date(message.created_at).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) })}</div>}<div className={`${styles.messageRow} ${own ? styles.ownRow : ""} ${grouped ? styles.groupedRow : ""}`}>{!own && (grouped ? <span className={styles.avatarSpace}/> : <Avatar user={conversation.other_user} small/>)}<div className={styles.bubbleGroup}>{!own && !grouped && <div className={styles.senderLine}>{conversation.other_user.name.split(" ")[0]} · {conversation.role === "guest" ? "Host" : "Guest"} <time dateTime={message.created_at}>{timestamp}</time></div>}<p className={`${styles.bubble} ${own ? styles.ownBubble : ""}`} title={timestamp}>{message.body}</p><time className={styles.timestamp} dateTime={message.created_at}>{temporary?.pending ? "Sending…" : timestamp}</time>{temporary?.failed && <div className={styles.failed} role="alert"><span>{temporary.error || "Message not sent"}</span><button disabled={cooldown.blocked} onClick={() => { void deliver(temporary); }}>Retry</button></div>}</div></div></div>; })}</>}
    </div>{pollError && <p className={styles.connection} role="status">{pollError} {pollingPaused ? <button className="text-button" onClick={() => setPollingPaused(false)}>Reconnect</button> : "Checking again shortly."}</p>}<form className={styles.composer} onSubmit={submit}><label className="sr-only" htmlFor="message-draft">Write a message</label><textarea id="message-draft" ref={textarea} rows={1} maxLength={2000} value={draft} disabled={messages.isError || messages.isPending} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(); } }} placeholder="Write a message…"/><button type="submit" className={styles.send} aria-label="Send message" disabled={!draft.trim() || sending || cooldown.blocked || messages.isError || messages.isPending}><Send size={20}/></button><span className={styles.composerCount}>{draft.length}/2000</span></form>
  </section>;
}

function ConversationDetails({ conversation, mobileOpen, onClose }: { conversation: ConversationSummary; mobileOpen: boolean; onClose: () => void }) {
  const listing = useQuery({ queryKey: queryKeys.listing(conversation.listing.id), queryFn: ({ signal }) => getListing(conversation.listing.id, signal) });
  const bookings = useQuery({ queryKey: conversation.role === "guest" ? queryKeys.bookings : queryKeys.hostBookings, queryFn: ({ signal }) => conversation.role === "guest" ? getBookings(signal) : getHostBookings(undefined, signal) });
  const matches = bookings.data?.filter(item => item.listing.id === conversation.listing.id && (conversation.role === "guest" || (item as HostBooking).guest.id === conversation.other_user.id)) ?? [];
  const booking = matches.find(item => item.status === "confirmed" && item.check_out > new Date().toLocaleDateString("en-CA")) ?? matches[0];
  const kind = listing.data ? ({ house: "Home", apartment: "Flat", guesthouse: "Guesthouse", hotel: "Room" }[listing.data.property_type]) : null;
  return <aside className={`${styles.details} ${mobileOpen ? styles.mobileDetails : ""}`}><header className={styles.detailsHeader}><h2>{booking ? "Reservation" : "Details"}</h2><button type="button" className={styles.headerAction} aria-label="Close conversation details" onClick={onClose}><X size={20}/></button></header><div className={styles.detailsBody}><Link href={`/rooms/${conversation.listing.id}`} className={styles.listingDetail}>{conversation.listing.cover_image_url && <div className={styles.detailPhoto}><AppImage src={conversation.listing.cover_image_url} alt={conversation.listing.title} fill sizes="(min-width: 1440px) 324px, 256px"/></div>}<h3>{kind && listing.data ? `${kind} in ${listing.data.city}` : conversation.listing.title}</h3><p className={styles.hostedBy}>Hosted by {conversation.role === "guest" ? conversation.other_user.name.split(" ")[0] : "you"}</p><span>View listing <ChevronRight size={16}/></span></Link><Link href={`/users/${conversation.other_user.id}`} className={styles.profileLink}><Avatar user={conversation.other_user}/><div><strong>{conversation.other_user.name}</strong><span>View profile</span></div><ChevronRight size={18}/></Link>{bookings.isPending ? <p className="muted">Loading trip details…</p> : bookings.isError ? <p className="error-text" role="alert">Trip details could not be loaded.</p> : booking ? <div className={styles.bookingDetail}><h3>{conversation.role === "guest" ? "Your trip" : "Reservation"}</h3><p>{formatDateRange(booking.check_in, booking.check_out)}</p><p>{booking.guests} {booking.guests === 1 ? "guest" : "guests"} · {booking.nights} {booking.nights === 1 ? "night" : "nights"}</p><p className={styles.bookingStatus}>{booking.status === "confirmed" ? "Confirmed" : "Cancelled"}</p><dl><dt>Total</dt><dd>{formatPrice(booking.total)}</dd></dl><Link href={conversation.role === "guest" ? `/trips?booking=${booking.id}` : "/hosting"} className="text-button">View reservation</Link></div> : <p className={styles.noReservation}>No reservation for this conversation yet.</p>}</div></aside>;
}
