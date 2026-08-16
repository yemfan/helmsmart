import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Welcome aboard — CloseBoss",
  description: "Meet Max, the captain of your AI real estate team.",
  robots: { index: false, follow: false },
};

export default async function WelcomeLayout({ children }: { children: React.ReactNode }) {
  const t = await getServerT();
  // Full-screen takeover: the onboarding is a focused first-run flow, so it
  // covers the marketing header/footer rendered by the root layout.
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-50">{children}</div>;
}
