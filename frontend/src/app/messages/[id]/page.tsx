import type { Metadata } from "next";
import { InboxView } from "@/components/messages/inbox-view";
export const metadata: Metadata = { title: "Messages" };
export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conversationId = Number(id);
  return <InboxView conversationId={Number.isSafeInteger(conversationId) && conversationId > 0 ? conversationId : -1} />;
}
