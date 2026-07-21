import type { Metadata } from "next";
import LeadSmartEditorialLanding from "@/components/marketing/LeadSmartEditorialLanding";

export const metadata: Metadata = {
  title: "CloseBoss — Stop losing leads in the first 5 minutes.",
  description:
    "AI follow-up for real estate agents. Every new Zillow / Realtor / IDX lead gets a reply in under 60 seconds, in your voice, on your number.",
  alternates: { canonical: "/landing-v3" },
  // robots: this is the rebuild in staging — flip to indexable once product sign-off lands.
  robots: { index: false, follow: false },
};

export default function LandingV3Page() {
  return <LeadSmartEditorialLanding />;
}
