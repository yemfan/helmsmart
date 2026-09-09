import "./globals.css";
import "@helm/ui/tokens";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getActivePack } from "@/lib/packs";
import { I18nProvider } from "@/lib/i18n/client";
import { getServerLocale, getServerT } from "@/lib/i18n/server";

const fontBody = Geist({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const [pack, t] = await Promise.all([getActivePack(), getServerT("site")]);
  return {
    title: {
      default: pack.productName,
      template: `%s | ${pack.productName}`,
    },
    description: t("meta.description", {
      defaultValue: "More control, less effort — AI-powered front office for small businesses.",
    }),
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The reader's locale is resolved once here (cookie → Accept-Language →
  // English) and drives three things: <html lang>, the client i18next
  // instance, and — through getServerT — every Server Component below.
  const [pack, locale, t] = await Promise.all([
    getActivePack(),
    getServerLocale(),
    getServerT("nav"),
  ]);
  return (
    <html lang={locale} data-pack={pack.dataPack}>
      <body
        className={`${fontBody.variable} ${fontMono.variable} antialiased bg-slate-50 text-slate-900`}
      >
        <I18nProvider locale={locale}>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-lg"
          >
            {t("skipToContent")}
          </a>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
