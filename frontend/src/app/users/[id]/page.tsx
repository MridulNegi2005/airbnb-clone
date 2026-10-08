import { notFound } from "next/navigation";
import { PublicProfile } from "@/components/profiles/public-profile";
export const metadata = { title: "Profile" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; const userId = Number(id); if (!Number.isSafeInteger(userId) || userId < 1) notFound(); return <PublicProfile id={userId} />; }
