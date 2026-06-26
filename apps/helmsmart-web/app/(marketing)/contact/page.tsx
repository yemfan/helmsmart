import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageSquare, Clock, Building2 } from "lucide-react";
import ContactFormComponent from "./_components/contact-form";

export const metadata: Metadata = {
  title: "Contact — HelmSmart",
  description: "Get in touch with the HelmSmart team. We're here to help.",
};

const channels = [
  {
    icon: Mail,
    title: "Email us",
    description: "For general questions, billing, or anything else.",
    contact: "hello@helmsmart.ai",
    href: "mailto:hello@helmsmart.ai",
    color: "text-indigo-600 bg-indigo-50",
  },
  {
    icon: MessageSquare,
    title: "Support",
    description: "Need help with your account or a technical issue?",
    contact: "support@helmsmart.ai",
    href: "mailto:support@helmsmart.ai",
    color: "text-emerald-600 bg-emerald-50",
  },
  {
    icon: Clock,
    title: "Response time",
    description: "We typically reply within one business day.",
    contact: "Mon – Fri, 9 am – 6 pm PT",
    href: null,
    color: "text-amber-600 bg-amber-50",
  },
];

export default function ContactPage() {
  return (
    <div className="bg-white">

      {/* Hero */}
      <section className="border-b border-gray-100 bg-gradient-to-b from-slate-50 to-white">
        <div className="mx-auto max-w-3xl px-6 py-20 sm:py-28 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Get in touch
          </h1>
          <p className="mt-4 text-lg text-gray-500">
            Questions, feedback, or just want to say hi — we&apos;d love to hear from you.
          </p>
        </div>
      </section>

      {/* Contact channels */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-3">
          {channels.map((channel) => {
            const Icon = channel.icon;
            const inner = (
              <>
                <div className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${channel.color} mb-4`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">{channel.title}</h3>
                <p className="text-sm text-gray-500 mb-3 leading-relaxed">{channel.description}</p>
                <p className="text-sm font-medium text-gray-700">{channel.contact}</p>
              </>
            );

            return channel.href ? (
              <a
                key={channel.title}
                href={channel.href}
                className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm hover:shadow-md transition-shadow block"
              >
                {inner}
              </a>
            ) : (
              <div key={channel.title} className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
                {inner}
              </div>
            );
          })}
        </div>
      </section>

      {/* Contact form */}
      <section className="mx-auto max-w-2xl px-6 pb-20">
        <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Send us a message</h2>
          <ContactFormComponent />
        </div>

        <p className="mt-6 text-center text-sm text-gray-500">
          Looking to schedule a demo?{" "}
          <Link href="/contact/sales" className="font-medium text-indigo-600 hover:text-indigo-700">
            Get a personalized quote
          </Link>
          {" "}or check our{" "}
          <Link href="/faq" className="font-medium text-indigo-600 hover:text-indigo-700">
            FAQ
          </Link>
          .
        </p>

        {/* Business information — names the operating legal entity +
            registered address so carriers / trust vendors can verify the
            HelmSmart ↔ helmsmart.ai association from a high-visibility page
            (mirrors the footer + Privacy/Terms). */}
        <div className="mt-10 rounded-2xl border border-gray-100 bg-slate-50 p-7">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-200 text-slate-700">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-semibold text-gray-900">Business information</h3>
              <p className="text-sm text-gray-500">Operating company &amp; mailing address</p>
            </div>
          </div>
          <address className="mt-3 text-sm not-italic leading-relaxed text-gray-600">
            <span className="font-medium text-gray-900">MAXY Investment Inc.</span>
            <br />
            HelmSmart is a DBA of MAXY Investment Inc.
            <br />
            6511 Parkriver Crossing
            <br />
            Sugar Land, TX 77479
            <br />
            United States
          </address>
        </div>
      </section>
    </div>
  );
}
