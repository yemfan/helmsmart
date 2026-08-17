import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import ImportFileClient from "./ImportFileClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: `${t("pages.importFile.metaTitle", { ns: "dashboard" })} | CloseBoss`,
  };
}

export default function ImportFilePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <ImportFileClient />
    </div>
  );
}
