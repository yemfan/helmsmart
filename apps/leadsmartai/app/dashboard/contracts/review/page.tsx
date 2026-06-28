import type { Metadata } from "next";
import { ReviewContractClient } from "./ReviewContractClient";

export const metadata: Metadata = {
  title: "Contract review | RealtyBoss",
  description: "AI plain-English review of a purchase contract — key terms, deadlines, risk flags, and blank fields. Not legal advice.",
};

export default function ContractReviewPage() {
  return <ReviewContractClient />;
}
