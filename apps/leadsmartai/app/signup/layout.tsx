import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Create Your Free Account",
  description: "Sign up for CloseBoss and start capturing, qualifying, and converting leads with AI-powered lead management for real estate professionals.",
  keywords: ["sign up", "create account", "register", "CloseBoss", "free trial"],
};

/** Prevents static prerender at build when Supabase public env vars are unset (e.g. Vercel without env). */
export const dynamic = "force-dynamic";

export default function SignupLayout({ children }: { children: ReactNode }) {
  return children;
}
