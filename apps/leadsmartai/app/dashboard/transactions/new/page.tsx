import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { NewTransactionClient } from "./NewTransactionClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.newTransaction.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function NewTransactionPage() {
  return <NewTransactionClient />;
}
