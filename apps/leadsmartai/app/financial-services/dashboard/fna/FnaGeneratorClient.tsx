"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, FileText, Printer, RotateCcw } from "lucide-react";
import { faSampleFnaInputs } from "@/lib/financial-services-demo-data";
import { intlLocale } from "@/lib/i18n/locale";

type RiskTolerance = "conservative" | "moderate" | "aggressive";

type Calculations = {
  householdIncome: number;
  incomeReplacementNeed: number;
  dimeNumber: number;
  coverageGap: number;
  recommendedCoverage: number;
  retirementAnnualNeed: number;
  retirementLumpSumNeed: number;
  retirementProjectedSavings: number;
  retirementShortfall: number;
  yearsToRetirement: number;
};

type FnaResponse =
  | { ok: true; report: string; cached: boolean; tokensUsed: number; calculations: Calculations }
  | { ok: false; error: string };

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function FnaGeneratorClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [form, setForm] = useState({
    clientName: faSampleFnaInputs.clientName,
    age: String(faSampleFnaInputs.age),
    spouseAge: String(faSampleFnaInputs.spouseAge),
    annualIncome: String(faSampleFnaInputs.annualIncome),
    spouseIncome: String(faSampleFnaInputs.spouseIncome),
    dependents: String(faSampleFnaInputs.dependents),
    outstandingDebts: String(faSampleFnaInputs.outstandingDebts),
    mortgageBalance: String(faSampleFnaInputs.mortgageBalance),
    currentSavings: String(faSampleFnaInputs.currentSavings),
    current401k: String(faSampleFnaInputs.current401k),
    retirementAge: String(faSampleFnaInputs.retirementAge),
    monthlyExpenses: String(faSampleFnaInputs.monthlyExpenses),
    existingCoverage: String(faSampleFnaInputs.existingCoverage),
    riskTolerance: faSampleFnaInputs.riskTolerance as RiskTolerance,
    goals: faSampleFnaInputs.goals.join(", "),
    advisorName: "",
    agencyName: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [report, setReport] = useState("");
  const [calc, setCalc] = useState<Calculations | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((s) => ({ ...s, [k]: e.target.value }));

  function reset() {
    setReport("");
    setCalc(null);
    setError("");
  }

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setReport("");
    setCalc(null);

    try {
      const res = await fetch("/api/financial-services/fna", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: form.clientName,
          age: Number(form.age) || undefined,
          spouseAge: Number(form.spouseAge) || undefined,
          annualIncome: Number(form.annualIncome) || undefined,
          spouseIncome: Number(form.spouseIncome) || undefined,
          dependents: Number(form.dependents) || undefined,
          outstandingDebts: Number(form.outstandingDebts) || undefined,
          mortgageBalance: Number(form.mortgageBalance) || undefined,
          currentSavings: Number(form.currentSavings) || undefined,
          current401k: Number(form.current401k) || undefined,
          retirementAge: Number(form.retirementAge) || undefined,
          monthlyExpenses: Number(form.monthlyExpenses) || undefined,
          existingCoverage: Number(form.existingCoverage) || undefined,
          riskTolerance: form.riskTolerance,
          goals: form.goals
            .split(",")
            .map((g) => g.trim())
            .filter(Boolean),
          advisorName: form.advisorName || undefined,
          agencyName: form.agencyName || undefined,
        }),
      });

      const json = (await res.json()) as FnaResponse;
      if (!res.ok || !("ok" in json) || json.ok !== true) {
        const msg = "ok" in json && json.ok === false ? json.error : "Failed to generate FNA";
        throw new Error(msg);
      }
      setReport(json.report);
      setCalc(json.calculations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate FNA");
    } finally {
      setLoading(false);
    }
  }

  const reportHtml = useMemo(() => {
    if (!report) return "";
    return report
      .replace(/^## (.+)$/gm, '<h2 class="mt-6 mb-2 text-lg font-semibold text-slate-900">$1</h2>')
      .replace(/^### (.+)$/gm, '<h3 class="mt-4 mb-1 text-base font-semibold text-slate-800">$1</h3>')
      .replace(/^\d+\)\s+(.+)$/gm, '<li class="ml-5 list-decimal">$1</li>')
      .replace(/^- (.+)$/gm, '<li class="ml-5 list-disc">$1</li>')
      .replace(/\n\n/g, '<p class="mt-3"></p>');
  }, [report]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("pages.fsMarketing.fna")}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Type the client&apos;s info → get an agent-branded FNA in under a minute.
          </p>
        </div>
        {report && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Printer className="h-4 w-4" />{t("pages.fsMarketing.printPdf")}</button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" />{t("pages.fsMarketing.newFna")}</button>
          </div>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-12">
        <section className="xl:col-span-5 print:hidden">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-base font-semibold text-slate-900">{t("pages.fsMarketing.clientInputs")}</h2>
            <p className="mt-1 text-xs text-slate-500">{t("pages.fsMarketing.defaultsPrefilled")}</p>

            <div className="mt-5 space-y-4">
              <Field label={t("pages.fsMarketing.clientName")}>
                <input className={inputCls} value={form.clientName} onChange={set("clientName")} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("pages.fsMarketing.age")}>
                  <input type="number" className={inputCls} value={form.age} onChange={set("age")} />
                </Field>
                <Field label={t("pages.fsMarketing.spouseAge")}>
                  <input type="number" className={inputCls} value={form.spouseAge} onChange={set("spouseAge")} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Annual income ($)">
                  <input type="number" className={inputCls} value={form.annualIncome} onChange={set("annualIncome")} />
                </Field>
                <Field label="Spouse income ($)">
                  <input type="number" className={inputCls} value={form.spouseIncome} onChange={set("spouseIncome")} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("pages.fsMarketing.dependents")}>
                  <input type="number" className={inputCls} value={form.dependents} onChange={set("dependents")} />
                </Field>
                <Field label="Monthly expenses ($)">
                  <input type="number" className={inputCls} value={form.monthlyExpenses} onChange={set("monthlyExpenses")} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Outstanding debts ($)">
                  <input type="number" className={inputCls} value={form.outstandingDebts} onChange={set("outstandingDebts")} />
                </Field>
                <Field label="Mortgage balance ($)">
                  <input type="number" className={inputCls} value={form.mortgageBalance} onChange={set("mortgageBalance")} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Liquid savings ($)">
                  <input type="number" className={inputCls} value={form.currentSavings} onChange={set("currentSavings")} />
                </Field>
                <Field label="401k / IRA ($)">
                  <input type="number" className={inputCls} value={form.current401k} onChange={set("current401k")} />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label={t("pages.fsMarketing.retirementAge")}>
                  <input type="number" className={inputCls} value={form.retirementAge} onChange={set("retirementAge")} />
                </Field>
                <Field label="Existing coverage ($)">
                  <input type="number" className={inputCls} value={form.existingCoverage} onChange={set("existingCoverage")} />
                </Field>
              </div>

              <Field label={t("pages.fsMarketing.riskTolerance")}>
                <select className={inputCls} value={form.riskTolerance} onChange={set("riskTolerance")}>
                  <option value="conservative">{t("pages.fsMarketing.conservative")}</option>
                  <option value="moderate">{t("pages.fsMarketing.moderate")}</option>
                  <option value="aggressive">{t("pages.fsMarketing.aggressive")}</option>
                </select>
              </Field>

              <Field label={t("pages.fsMarketing.goals")}>
                <input className={inputCls} value={form.goals} onChange={set("goals")} />
              </Field>

              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                <Field label={t("pages.fsMarketing.producerName")}>
                  <input className={inputCls} value={form.advisorName} onChange={set("advisorName")} placeholder="(optional)" />
                </Field>
                <Field label={t("pages.fsMarketing.agency")}>
                  <input className={inputCls} value={form.agencyName} onChange={set("agencyName")} placeholder="(optional)" />
                </Field>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={loading || !form.clientName}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? "Generating FNA…" : "Generate FNA"}
            </button>

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
            )}
          </div>
        </section>

        <section className="xl:col-span-7">
          {!report && !loading && (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center print:hidden">
              <FileText className="h-10 w-10 text-slate-400" />
              <p className="mt-4 text-sm text-slate-600">{t("pages.fsMarketing.reportAppearsBefore")}<strong>{t("pages.fsMarketing.generateFna")}</strong>{t("pages.fsMarketing.reportAppearsAfter")}</p>
            </div>
          )}

          {loading && (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-indigo-600" />
              <p className="mt-4 text-sm font-medium text-slate-700">Analyzing client profile…</p>
              <p className="mt-1 text-xs text-slate-500">{t("pages.fsMarketing.computing")}</p>
            </div>
          )}

          {report && (
            <article id="fna-report" className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <header className="border-b border-slate-100 pb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600">{t("pages.fsMarketing.fna")}</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                  Prepared for {form.clientName}
                </h1>
                <p className="mt-1 text-xs text-slate-500">
                  {t("pages.fsMarketing.generatedOn", { date: new Date().toLocaleDateString(locale) })} ·{" "}
                  {form.advisorName ? `Prepared by ${form.advisorName}` : "Prepared by your producer"}
                  {form.agencyName ? ` · ${form.agencyName}` : ""}
                </p>
              </header>

              {calc && (
                <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <KpiBox label={t("pages.fsMarketing.incomeReplacement")} value={usd(calc.incomeReplacementNeed)} />
                  <KpiBox label={t("pages.fsMarketing.dimeTotal")} value={usd(calc.dimeNumber)} />
                  <KpiBox label={t("pages.fsMarketing.recommendedCoverage")} value={usd(calc.recommendedCoverage)} accent />
                  <KpiBox label={t("pages.fsMarketing.retirementShortfall")} value={usd(calc.retirementShortfall)} />
                </section>
              )}

              <div
                className="prose prose-slate mt-2 max-w-none text-sm leading-7 text-slate-700"
                dangerouslySetInnerHTML={{ __html: reportHtml }}
              />
            </article>
          )}
        </section>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function KpiBox({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={[
        "rounded-xl border px-3 py-3",
        accent ? "border-indigo-200 bg-indigo-50/60" : "border-slate-200 bg-slate-50",
      ].join(" ")}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p
        className={[
          "mt-1 text-xl font-semibold tabular-nums",
          accent ? "text-indigo-700" : "text-slate-900",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}
