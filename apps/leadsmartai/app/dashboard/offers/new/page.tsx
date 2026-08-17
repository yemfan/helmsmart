import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { NewOfferClient } from "./NewOfferClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.newOffer.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function NewOfferPage() {
  return <NewOfferClient />;
}
