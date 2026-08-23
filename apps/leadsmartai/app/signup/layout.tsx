import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.signup.title", { ns: "web_marketing" });
  const description = t("routeMeta.signup.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["sign up", "create account", "register", "CloseBoss", "free trial"],
};
}

/** Prevents static prerender at build when Supabase public env vars are unset (e.g. Vercel without env). */
export const dynamic = "force-dynamic";

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
