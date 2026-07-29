import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Building2, LifeBuoy, Mail, MessageCircle } from "lucide-react";
import ContactForm from "./ContactForm";
import JsonLd from "@/components/JsonLd";
import { getServerT } from "@/lib/i18n/server";
import { pageMetadata } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const tc = (key: string): string => t(key, { ns: "web_contact" });
  return {
    ...pageMetadata({
      title: tc("meta.title"),
      description: tc("meta.description"),
      path: "/contact",
    }),
    keywords: ["contact", "support", "CloseBoss", "CRM", "lead management"],
  };
}

export default async function ContactPage() {
  const t = await getServerT();
  const tc = (key: string): string => t(key, { ns: "web_contact" });
  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "CloseBoss",
          legalName: "MAXY Investment Inc.",
          url: "https://closebossai.com",
          email: "contact@closebossai.com",
          address: {
            "@type": "PostalAddress",
            streetAddress: "6511 Parkriver Crossing",
            addressLocality: "Sugar Land",
            addressRegion: "TX",
            postalCode: "77479",
            addressCountry: "US",
          },
          contactPoint: {
            "@type": "ContactPoint",
            contactType: "Customer Service",
            email: "contact@closebossai.com",
            availableLanguage: ["en"],
          },
        }}
      />
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {tc("hero.h1")}
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-slate-600">
          {tc("hero.subtitle")}
        </p>
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-5">
        {/* Contact form */}
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-lg font-semibold text-slate-900">
              {tc("form_card.title")}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {tc("form_card.subtitle")}
            </p>
            <Suspense fallback={null}>
              <ContactForm />
            </Suspense>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6 lg:col-span-2">
          {/* Live chat card */}
          <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 to-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <LifeBuoy className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{tc("sidebar.live_chat.title")}</h3>
                <p className="text-sm text-slate-500">{tc("sidebar.live_chat.subtitle")}</p>
              </div>
            </div>
            <Link
              href="/support"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2} />
              {tc("sidebar.live_chat.cta")}
            </Link>
          </div>

          {/* Email card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
                <Mail className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{tc("sidebar.email.title")}</h3>
                <p className="text-sm text-slate-500">
                  {tc("sidebar.email.subtitle")}
                </p>
              </div>
            </div>
            <a
              href="mailto:contact@closebossai.com"
              className="mt-3 block text-sm font-medium text-[#0072ce] hover:underline"
            >
              contact@closebossai.com
            </a>
          </div>

          {/* Business information — names the operating legal entity +
              registered address so carriers / trust vendors can verify the
              business ↔ closebossai.com association from a high-visibility
              page (mirrors the footer + Privacy/Terms). */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <Building2 className="h-5 w-5" strokeWidth={2} />
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{tc("sidebar.business.title")}</h3>
                <p className="text-sm text-slate-500">{tc("sidebar.business.subtitle")}</p>
              </div>
            </div>
            <address className="mt-3 text-sm not-italic leading-relaxed text-slate-600">
              <span className="font-medium text-slate-900">MAXY Investment Inc.</span>
              <br />
              {tc("sidebar.business.company_note")}
              <br />
              6511 Parkriver Crossing
              <br />
              Sugar Land, TX 77479
              <br />
              United States
            </address>
          </div>

          {/* Back link */}
          <Link
            href="/"
            className="inline-block text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            {tc("sidebar.back_home")}
          </Link>
        </div>
      </div>
    </div>
  );
}
