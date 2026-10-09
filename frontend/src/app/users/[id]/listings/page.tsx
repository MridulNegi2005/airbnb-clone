import { notFound } from "next/navigation";
import { ProfileListings } from "@/components/profiles/profile-listings";

export const metadata = { title: "Profile listings" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId < 1) notFound();
  return <ProfileListings id={userId} />;
}
