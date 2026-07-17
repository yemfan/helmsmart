import type { Metadata } from "next";
import { Archivo, Inter, IBM_Plex_Mono, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: ["500", "700", "800", "900"],
  variable: "--font-archivo",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});
const notoSC = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sc",
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://swipendone.com";

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "SwipenDone — AI instruction decks with built-in diagnosis",
  description:
    "Turn a folder of photos into a swipeable, bilingual instruction guide your customers scan from a QR code. AI instructions get them assembled. AI diagnosis keeps them from returning it.",
  openGraph: {
    title: "SwipenDone — AI instruction decks with built-in diagnosis",
    description:
      "Turn a folder of photos into a swipeable, bilingual instruction guide your customers scan from a QR code.",
    url: APP_URL,
    siteName: "SwipenDone",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${archivo.variable} ${inter.variable} ${plexMono.variable} ${notoSC.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
