import type { Metadata } from "next";
import ClientPortalShell from "@/components/client/ClientPortalShell";

export const metadata: Metadata = {
  title: "My deal | RealtyBoss",
  description: "Track your transaction, documents, and messages with your agent.",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <ClientPortalShell>{children}</ClientPortalShell>;
}
