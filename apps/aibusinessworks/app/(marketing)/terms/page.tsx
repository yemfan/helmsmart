import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Partner Program Terms",
  description: "The agreement between AI Business Works and its Partners: eligibility, customer attribution, compensation, payment, leadership, conduct and termination.",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <LegalPage documentKey="partner-terms" />;
}
