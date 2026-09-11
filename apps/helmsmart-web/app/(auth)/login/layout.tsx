import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

// The page is a client component and cannot export metadata, so its title
// lives here. Without it the tab read a bare "HelmSmart" — the same as signup
// and forgot-password. The root template appends the brand.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("auth");
  return { title: t("meta.login") };
}

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
