"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ContractReview } from "@/lib/contracts/reviewContract";

const MAX_PDF_BYTES = 8 * 1024 * 1024;

const SEV_BADGE: Record<"high" | "medium" | "low", string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-700",
};

export function ReviewContractClient() {
  const { t } = useTranslation("dashboard");
  const [text, setText] = useState("");
  const [pdfName, setPdfName] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<ContractReview | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function run(body: FormData | string) {
    setError(null);
    setReviewing(true);
    try {
      const res = await fetch("/api/dashboard/contracts/review", {
        method: "POST",
        ...(typeof body === "string"
          ? { headers: { "content-type": "application/json" }, body }
          : { body }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        review?: ContractReview;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.review) throw new Error(json.error ?? "Review failed.");
      setReview(json.review);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed.");
    } finally {
      setReviewing(false);
    }
  }

  function onPdf(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") && !file.type.includes("pdf")) {
      setError(t("pages.contractReview.needFile"));
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setError(`That PDF is ${Math.round(file.size / 1024 / 1024)} MB — max 8 MB.`);
      return;
    }
    setPdfName(file.name);
    const fd = new FormData();
    fd.append("file", file);
    void run(fd);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/transactions" className="hover:underline">{t("pages.reviewContract.transactions")}</Link>
          {` / ${t("pages.contractReview.breadcrumb")}`}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t("pages.contractReview.heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.dashFragments.contractReviewBody")}{" "}
          <strong>{t("pages.contractReview.disclaimer")}</strong>
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.contractReview.contractPdf")}</label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPdf(f);
            }}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={reviewing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              📄 {t("pages.contractReview.choosePdf")}
            </button>
            <span className="text-[11px] text-slate-500">
              {pdfName ? (
                <>{t("pages.reviewContract.selected")}<strong className="font-medium text-slate-700">{pdfName}</strong>
                </>
              ) : (
                <>{t("pages.contractReview.maxSize")}</>
              )}
            </span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-x-0 top-1/2 h-px bg-slate-200" aria-hidden />
          <span className="relative inline-block bg-white px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Or
          </span>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.contractReview.pasteHeading")}</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={t("pages.contractReview.pastePlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => void run(JSON.stringify({ text }))}
            disabled={reviewing || !text.trim()}
            className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005fa8] disabled:opacity-50"
          >
            {reviewing ? t("pages.contractReview.reviewing") : t("pages.contractReview.review")}
          </button>
        </div>
      </div>

      {reviewing ? (
        <p className="py-6 text-center text-sm text-slate-400">{t("pages.contractReview.reading")}</p>
      ) : null}

      {review ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">{t("pages.contractReview.summary")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-700">{review.summary}</p>
            {review.parties || review.property ? (
              <p className="mt-2 text-xs text-slate-500">
                {review.property ? <>📍 {review.property} </> : null}
                {review.parties ? <>· {review.parties}</> : null}
              </p>
            ) : null}
          </div>

          {review.flags.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">{t("pages.dashFragments.flagsToReview")}{review.flags.length})</h2>
              <ul className="mt-2 space-y-2">
                {review.flags.map((f, i) => (
                  <li key={i} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SEV_BADGE[f.severity]}`}>
                        {f.severity}
                      </span>
                      <span className="text-sm font-medium text-slate-900">{f.title}</span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">{f.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {review.deadlines.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">{t("pages.contractReview.dates")}</h2>
              <ul className="mt-2 divide-y divide-slate-100 text-sm">
                {review.deadlines.map((d, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 py-1.5">
                    <span className="text-slate-700">{d.label}</span>
                    <span className="shrink-0 text-right text-slate-900">
                      {d.date ?? "—"}
                      {d.note ? <span className="block text-[11px] text-slate-400">{d.note}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {review.keyTerms.length > 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-slate-900">{t("pages.contractReview.keyTerms")}</h2>
                <dl className="mt-2 divide-y divide-slate-100 text-sm">
                  {review.keyTerms.map((t, i) => (
                    <div key={i} className="grid grid-cols-2 gap-2 py-1.5">
                      <dt className="text-slate-500">{t.label}</dt>
                      <dd className="text-slate-900">{t.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {review.missing.length > 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <h2 className="text-sm font-semibold text-amber-900">{t("pages.contractReview.blanks")}</h2>
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-amber-900">
                  {review.missing.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {review.questions.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900">{t("pages.contractReview.confirm")}</h2>
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-slate-700">
                {review.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px] italic text-slate-500">
            {review.disclaimer}
          </p>
        </div>
      ) : null}
    </div>
  );
}
