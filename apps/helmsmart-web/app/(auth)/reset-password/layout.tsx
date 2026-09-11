import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getServerT } from "@/lib/i18n/server";

// The page is a client component and cannot export metadata, so its title
// lives here. The root template appends the brand.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("auth");
  return { title: t("meta.resetPassword") };
}

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
