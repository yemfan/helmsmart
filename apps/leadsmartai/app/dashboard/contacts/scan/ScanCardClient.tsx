"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";

type Extracted = {
  name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  address: string | null;
};

type Step = "capture" | "processing" | "review" | "saved";

export default function ScanCardClient() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [fields, setFields] = useState<Extracted>({ name: null, email: null, phone: null, company: null, title: null, address: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileSelected(file: File) {
    setError(null);
    // Show preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    // Convert to base64 and send to API
    setStep("processing");
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/mobile/contacts/scan/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Scan failed");

      setFields({
        name: body.suggested?.name ?? null,
        email: body.suggested?.email ?? null,
        phone: body.suggested?.phone ?? null,
        company: body.suggested?.company ?? null,
        title: body.suggested?.title ?? null,
        address: body.suggested?.address ?? null,
      });
      setStep("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed");
      setStep("capture");
    }
  }

  async function saveContact() {
    setSaving(true);
    setError(null);
    try {
      const notes = [fields.company, fields.title].filter(Boolean).join(" \u2014 ");
      const res = await fetch("/api/dashboard/contacts/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          email: fields.email,
          phone: fields.phone,
          property_address: fields.address,
          notes: notes || null,
          source: "business_card",
          forceCreate: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Save failed");
      setStep("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setStep("capture");
    setPreview(null);
    setFields({ name: null, email: null, phone: null, company: null, title: null, address: null });
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t("pages.scanCard.heading")}</h1>
          <p className="text-sm text-slate-500">{t("pages.scanCard.intro")}</p>
        </div>
        <Link href="/dashboard/contacts" className="text-sm text-slate-500 hover:text-slate-900">{t("pages.scanCard.backToContacts")}</Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>
      )}

      {/* Step 1: Capture */}
      {step === "capture" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div
            onClick={() => fileRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/50 px-6 py-12 transition hover:border-blue-400 hover:bg-blue-50/30"
          >
            <svg className="h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
            <span className="mt-3 text-sm font-semibold text-slate-700">{t("pages.scanCard.tapToUpload")}</span>
            <span className="mt-1 text-xs text-slate-500">{t("pages.scanCard.tapHint")}</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileSelected(f);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {/* Step 2: Processing */}
      {step === "processing" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center space-y-4">
          {preview && (
            <img src={preview} alt={t("pages.scanCard.cardAlt")} className="mx-auto max-h-48 rounded-lg border border-slate-200 object-contain" />
          )}
          <div className="flex items-center justify-center gap-2">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
            <span className="text-sm text-slate-600">{t("pages.scanCard.reading")}</span>
          </div>
        </div>
      )}

      {/* Step 3: Review */}
      {step === "review" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
          {preview && (
            <div className="p-4">
              <img src={preview} alt={t("pages.scanCard.cardAlt")} className="mx-auto max-h-36 rounded-lg border border-slate-200 object-contain" />
            </div>
          )}
          <div className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">{t("pages.scanCard.review")}</h3>
            {([
              { key: "name" as const, label: "Name" },
              { key: "email" as const, label: "Email" },
              { key: "phone" as const, label: "Phone" },
              { key: "company" as const, label: "Company" },
              { key: "title" as const, label: "Title" },
              { key: "address" as const, label: "Address" },
            ]).map(({ key, label }) => (
              <div key={key}>
                <label className="block text-[11px] font-medium text-slate-500 mb-0.5">{label}</label>
                <input
                  value={fields[key] ?? ""}
                  onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value || null }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={`Enter ${label.toLowerCase()}`}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 p-5">
            <button
              type="button"
              onClick={() => void saveContact()}
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? t("pages.scanCard.saving") : t("pages.scanCard.save")}
            </button>
            <button
              type="button"
              onClick={reset}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >{t("pages.scanCard.retake")}</button>
          </div>
        </div>
      )}

      {/* Step 4: Saved */}
      {step === "saved" && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-900">{t("pages.scanCard.saved")}</p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >{t("pages.scanCard.scanAnother")}</button>
            <button
              type="button"
              onClick={() => router.push("/dashboard/contacts")}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >{t("pages.scanCard.viewContacts")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
