import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.login.title", { ns: "web_marketing" });
  const description = t("routeMeta.login.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["sign in", "login", "log in", "CloseBoss", "account"],
};
}

/** Prevents static prerender at build when Supabase public env vars are unset (e.g. Vercel without env). */
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
