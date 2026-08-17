import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { ReviewContractClient } from "./ReviewContractClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.contractReview.metaTitle", { ns: "dashboard" }),
    description: t("pages.contractReview.metaDescription", { ns: "dashboard" }),
  };
}

export default function ContractReviewPage() {
  return <ReviewContractClient />;
}
