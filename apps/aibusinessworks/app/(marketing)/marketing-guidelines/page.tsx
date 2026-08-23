import type { Metadata } from "next";
import { LegalPage } from "@/components/site/legal-page";

/** Public content: statically rendered, refreshed periodically so a
 *  compensation change reaches visitors without a deploy. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Partner Marketing Guidelines",
  description: "What an AI Business Works Partner may and may not say in public, including the prohibition on income claims and earnings guarantees.",
  alternates: { canonical: "/marketing-guidelines" },
};

export default function Page() {
  return <LegalPage documentKey="marketing-guidelines" />;
}
