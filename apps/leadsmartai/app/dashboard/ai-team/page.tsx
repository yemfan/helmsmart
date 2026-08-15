import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import AiTeamClient from "./AiTeamClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("aiTeam.metaTitle", { ns: "dashboard" }),
    description: t("aiTeam.metaDescription", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function AiTeamPage() {
  return <AiTeamClient />;
}
