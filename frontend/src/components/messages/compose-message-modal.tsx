"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { createConversation, queryKeys } from "@/lib/api";
import { Modal } from "@/components/ui/modal";
import { GradientButton } from "@/components/ui/gradient-button";
import { useAuth } from "@/providers/auth-provider";
import styles from "./messages.module.css";
import { useSendCooldown } from "./use-send-cooldown";

export function ComposeMessageModal({ open, onClose, listingId, hostName }: { open: boolean; onClose: () => void; listingId: number; hostName: string }) {
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const { status, openAuth } = useAuth();
  const router = useRouter();
  const client = useQueryClient();
  const cooldown = useSendCooldown();
  async function send() {
    if (!body.trim() || pending || cooldown.blocked) return;
    setPending(true); setError("");
    try {
      const conversation = await createConversation({ listing_id: listingId, body: body.trim() });
      await client.invalidateQueries({ queryKey: queryKeys.conversations });
      setBody(""); onClose(); router.push(`/messages/${conversation.id}`);
    } catch (reason) { cooldown.record(reason); setError(reason instanceof Error ? reason.message : "Your message could not be sent. Please try again."); }
    finally { setPending(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (status !== "authenticated") { openAuth(() => { void send(); }); return; }
    void send();
  }
  return <Modal open={open} onClose={() => { if (!pending) onClose(); }} title={`Message ${hostName.split(" ")[0] || "your host"}`}><form onSubmit={submit} className={styles.composeModal}><p>Ask a question about the place or share your trip plans.</p><label htmlFor="host-message">Your message</label><textarea id="host-message" autoFocus required maxLength={2000} rows={6} value={body} onChange={event => setBody(event.target.value)} placeholder="Hi! I’d love to know more about your place."/><span className={styles.counter}>{body.length}/2000</span>{error && <p role="alert" className="error-text">{error}</p>}<GradientButton disabled={pending || !body.trim() || cooldown.blocked} type="submit">{pending ? "Sending…" : "Send message"}</GradientButton></form></Modal>;
}
