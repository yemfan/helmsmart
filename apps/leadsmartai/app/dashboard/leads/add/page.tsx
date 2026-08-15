import { AddContactClient } from "./AddContactClient";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.addContact.metaTitle", { ns: "dashboard" }),
    description: t("pages.addContact.metaDescription", { ns: "dashboard" }),
    keywords: ["add lead", "new contact", "CRM"],
    robots: { index: false },
  };
}

export default function AddContactPage() {
  return <AddContactClient />;
}
