import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { NewOpenHouseClient } from "./NewOpenHouseClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.newOpenHouse.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function NewOpenHousePage() {
  return <NewOpenHouseClient />;
}
