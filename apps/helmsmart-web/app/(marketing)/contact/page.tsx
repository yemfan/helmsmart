import type { Metadata } from "next";
import { Mail, Clock, Building2 } from "lucide-react";
import ContactFormComponent from "./_components/contact-form";
import { getServerT } from "@/lib/i18n/server";
import { rich } from "../_rich";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  return {
    title: t("contact.meta.title"),
    description: t("contact.meta.description"),
  };
}

// Title, description and the line under them live in `site.contact.channels`;
// this array holds the icon, the colour and the destination.
const channels = [
  {
    key: "email",
    icon: Mail,
    href: "mailto:contact@helmsmart.ai",
    color: "text-indigo-600 bg-indigo-50",
  },
  {
    key: "hours",
    icon: Clock,
    href: null,
    color: "text-amber-600 bg-amber-50",
  },
];

export default async function ContactPage() {
  const t = await getServerT("site");

  return (
    <div className="bg-white">

      {/* Hero */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            {t("contact.hero.title")}
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            {t("contact.hero.subtitle")}
          </p>
        </div>
      </section>

      {/* Contact channels */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2">
          {channels.map((channel) => {
            const Icon = channel.icon;
            const inner = (
              <>
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${channel.color} mb-4`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">
                  {t(`contact.channels.${channel.key}.title`)}
                </h3>
                <p className="text-sm text-gray-500 mb-3 leading-relaxed">
                  {t(`contact.channels.${channel.key}.description`)}
                </p>
                <p className="text-sm font-medium text-gray-700">
                  {t(`contact.channels.${channel.key}.contact`)}
                </p>
              </>
            );

            return channel.href ? (
              <a
                key={channel.key}
                href={channel.href}
                className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md transition-shadow block"
              >
                {inner}
              </a>
            ) : (
              <div key={channel.key} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* Contact form */}
      <section className="mx-auto max-w-2xl px-6 pb-20">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-6">{t("contact.form.title")}</h2>
          <ContactFormComponent />
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          {rich(t("contact.demoNote"), {
            links: [
              { href: "/contact/sales", className: "font-medium text-indigo-600 hover:text-indigo-700" },
              { href: "/faq", className: "font-medium text-indigo-600 hover:text-indigo-700" },
            ],
          })}
        </p>

        {/* Business information — names the operating legal entity +
            registered address so carriers / trust vendors can verify the
            HelmSmart ↔ helmsmart.ai association from a high-visibility page
            (mirrors the footer + Privacy/Terms). The address itself stays in
            the form a US carrier reads, in either language. */}
        <div className="mt-10 rounded-2xl border border-gray-100 bg-slate-50 p-7">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-200 text-slate-700">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-gray-900">{t("contact.business.title")}</h3>
              <p className="text-sm text-gray-500">{t("contact.business.subtitle")}</p>
            </div>
          </div>
          <address className="mt-3 text-sm not-italic leading-relaxed text-gray-600">
            <span className="font-medium text-gray-900">MAXY Investment Inc.</span>
            <br />
            {t("contact.business.dba")}
            <br />
            6511 Parkriver Crossing
            <br />
            Sugar Land, TX 77479
            <br />
            {t("contact.business.country")}
          </address>
        </div>
      </section>
    </div>
  );
}
