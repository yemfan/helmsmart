import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Reset your password",
  description:
    "Enter your email to receive a link to reset your CloseBoss account password.",
  alternates: { canonical: "/forgot-password" },
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
