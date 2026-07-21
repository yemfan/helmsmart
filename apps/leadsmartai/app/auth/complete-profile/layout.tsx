import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Complete Your Profile",
  description: "Finish setting up your CloseBoss account.",
  keywords: ["profile", "onboarding", "setup"],
  robots: { index: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
