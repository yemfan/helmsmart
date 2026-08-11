import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "MarketingBoss — cinematic marketing creative on demand",
  description:
    "Generate scroll-stopping marketing images and video from a prompt. Pay-as-you-go, no subscription.",
  // Pinterest "claim your website" verification for the MarketingBoss business account.
  other: { "p:domain_verify": "f4dcb2998e0a384f9c95261faaae60b9" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
