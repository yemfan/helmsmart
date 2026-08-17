import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { NewShowingClient } from "./NewShowingClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.newShowing.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function NewShowingPage() {
  return <NewShowingClient />;
}
