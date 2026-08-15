import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { BuildOfferClient } from "./BuildOfferClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.buildOffer.metaTitle", { ns: "dashboard" }),
    description: t("pages.buildOffer.metaDescription", { ns: "dashboard" }),
  };
}

export default function BuildOfferPage() {
  return <BuildOfferClient />;
}
