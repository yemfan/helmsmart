import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "About CloseBoss | AI Growth Engine for Real Estate",
  description:
    "CloseBoss helps agents and financing professionals capture, qualify, and convert leads with AI—from first click to closed deal.",
  alternates: {
    canonical: "/about",
  },
  openGraph: {
    title: "About CloseBoss | AI Growth Engine for Real Estate",
    description:
      "CloseBoss helps agents and financing professionals capture, qualify, and convert leads with AI—from first click to closed deal.",
  },
};

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
