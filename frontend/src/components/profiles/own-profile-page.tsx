"use client";

import { useAuth } from "@/providers/auth-provider";
import { PublicProfile } from "./public-profile";
import { ProfileLoading, ProfileSignIn } from "./profile-states";

export function OwnProfilePage() {
  const { user, status } = useAuth();
  if (status === "loading") return <ProfileLoading />;
  if (!user) return <ProfileSignIn title="Your profile" />;
  return <PublicProfile id={user.id} account />;
}
