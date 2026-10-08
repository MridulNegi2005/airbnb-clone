import type { Metadata } from "next";
import { HostDashboard } from "@/components/hosting/dashboard/host-dashboard";

export const metadata: Metadata = { title: "Hosting dashboard" };

export default function HostingPage() {
  return <HostDashboard />;
}
