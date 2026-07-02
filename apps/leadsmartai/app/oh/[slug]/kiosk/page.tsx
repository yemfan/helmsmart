import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { getPublicOpenHouseBySlug } from "@/lib/open-houses/publicService";
import { KioskClient } from "./KioskClient";

export const metadata: Metadata = {
  title: "Open House Kiosk",
  robots: { index: false, follow: false },
  // iOS "Add to Home Screen" behaviour — installs as a standalone app
  // without browser chrome.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Open House",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0f172a",
};

type PageProps = { params: Promise<{ slug: string }> };

/**
 * iPad PWA kiosk mode for visitor sign-in.
 *
 * Same data source as /oh/[slug] but UX is landscape-first, huge tap
 * targets, auto-resets to blank after each submit, and queues offline
 * submits in localStorage to flush when connectivity returns. Meant to
 * be installed via "Add to Home Screen" on the iPad the morning of.
 *
 * PWA manifest is served at /oh/[slug]/kiosk/manifest.json.
 */
export default async function OpenHouseKioskPage({ params }: PageProps) {
  const { slug } = await params;
  const info = await getPublicOpenHouseBySlug(slug);
  if (!info || info.status === "cancelled") notFound();

  return (
    <>
      <link rel="manifest" href={`/oh/${slug}/kiosk/manifest.json`} />
      <link rel="apple-touch-icon" href="/brand/realtyboss/realtyboss-icon-180.png" />
      <KioskClient info={info} />
    </>
  );
}
