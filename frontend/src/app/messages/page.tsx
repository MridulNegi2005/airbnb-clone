import type { Metadata } from "next";
import { InboxView } from "@/components/messages/inbox-view";
export const metadata: Metadata = { title: "Messages" };
export default function MessagesPage() { return <InboxView />; }
