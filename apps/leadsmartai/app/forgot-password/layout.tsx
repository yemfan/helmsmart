import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.forgotPassword.title", { ns: "web_marketing" });
  const description = t("routeMeta.forgotPassword.description", { ns: "web_marketing" });
  return {
  title,
  description,
  alternates: { canonical: "/forgot-password" },
  robots: { index: false, follow: false },
};
}

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
