import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your RealtyBoss account to access lead management, CRM, and automation tools for real estate professionals.",
  keywords: ["sign in", "login", "log in", "RealtyBoss", "account"],
};

/** Prevents static prerender at build when Supabase public env vars are unset (e.g. Vercel without env). */
export const dynamic = "force-dynamic";

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
