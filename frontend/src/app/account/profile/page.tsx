import { ProfileEditor } from "@/components/profiles/profile-editor";
export const metadata = { title: "Profile" };
export default async function Page({ searchParams }: { searchParams: Promise<{ edit?: string }> }) { const { edit } = await searchParams; return <ProfileEditor edit={edit === "1"} />; }
