import type { Metadata } from "next";
import ClientPortalShell from "@/components/client/ClientPortalShell";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.clientPortal.title", { ns: "web_marketing" });
  const description = t("routeMeta.clientPortal.description", { ns: "web_marketing" });
  return {
  title,
  description,
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};
}

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  return <ClientPortalShell>{children}</ClientPortalShell>;
}
