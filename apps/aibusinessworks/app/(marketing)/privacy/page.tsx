import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What the AI Business Works Partner platform collects, why it is processed, who it is shared with, and the rights Partners have over their information.",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <LegalPage documentKey="privacy" />;
}
