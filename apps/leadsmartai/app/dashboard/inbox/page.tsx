import InboxClient from "./InboxClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("inbox.metaTitle", { ns: "dashboard" }),
    description: t("inbox.metaDescription", { ns: "dashboard" }),
    keywords: ["conversations", "inbox", "messages", "sms", "email", "communication"],
    robots: { index: false },
  };
}

export default function InboxPage() {
  return <InboxClient />;
}
