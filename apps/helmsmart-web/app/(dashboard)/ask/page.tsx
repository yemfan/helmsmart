import type { Metadata } from "next";
import { AskClient } from "./ask-client";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("home");
  return { title: t("ask.metaTitle") };
}

export default function AskPage() {
  return <AskClient />;
}
