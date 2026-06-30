import type { Metadata } from "next";
import { LayoutTemplate } from "lucide-react";
import TemplatePickerClient from "@/components/dashboard/TemplatePickerClient";

export const metadata: Metadata = {
  title: "Message Templates",
  description: "Browse and customize SMS and email templates for Sphere, Lead Response, and Lifecycle.",
  keywords: ["templates", "sms", "email", "messaging"],
  robots: { index: false },
};

export default function TemplatesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-md shadow-slate-900/15">
          <LayoutTemplate className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Message Templates</h1>
          <p className="mt-1 text-sm text-slate-600">
            The text of every message RealtyBoss sends on your behalf. Edit any template, toggle it off,
            or switch between review and autosend. Changes are per-agent — base templates aren&apos;t touched.
          </p>
        </div>
      </div>

      <TemplatePickerClient />
    </div>
  );
}
