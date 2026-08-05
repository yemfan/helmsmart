import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Welcome aboard — CloseBoss",
  description: "Meet Max, the captain of your AI real estate team.",
  robots: { index: false, follow: false },
};

export default function WelcomeLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50">{children}</div>;
}
