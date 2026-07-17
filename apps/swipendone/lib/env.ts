/** Canonical base URL for QR codes, share links, sitemap/robots. */
export function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "https://swipendone.com"
  );
}
