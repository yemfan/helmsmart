import type { Metadata } from "next";
import { BuildOfferClient } from "./BuildOfferClient";

export const metadata: Metadata = {
  title: "Build offer with AI | RealtyBoss",
  description: "Get AI-recommended buyer offer terms — price, contingencies, escalation, and a cover letter.",
};

export default function BuildOfferPage() {
  return <BuildOfferClient />;
}
