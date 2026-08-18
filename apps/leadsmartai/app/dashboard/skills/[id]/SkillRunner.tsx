"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";

import { runSkillAction } from "./actions";
import type { ComplianceGate } from "@/lib/closeboss/skills/run";

function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function SkillRunner({
  skillId,
  inputKeys,
  assigneeLabel,
}: {
  skillId: string;
  inputKeys: string[];
  assigneeLabel: string;
}) {
  const { t } = useTranslation("dashboard");
  const [values, setValues] = useState<Record<string, string>>({});
  const [output, setOutput] = useState<string | null>(null);
  const [gate, setGate] = useState<ComplianceGate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function run() {
    setError(null);
    setOutput(null);
    setGate(null);
    startTransition(async () => {
      const res = await runSkillAction(skillId, values);
      if (res.ok) {
        setOutput(res.output);
        setGate(res.gate);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-5">
      {inputKeys.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("pages.dashFragments.yourNameBrokerage")} {assigneeLabel.toLowerCase()} {t("pages.dashFragments.voiceMarketCompliance")}</p>
          {inputKeys.map((k) => (
            <div key={k}>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">{humanize(k)}</label>
              <textarea
                rows={k.length > 12 || k.includes("data") || k.includes("details") || k.includes("notes") ? 3 : 1}
                value={values[k] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                disabled={pending}
                className="w-full rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("pages.skillRunner.noInput")}</p>
      )}

      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {pending ? "Running…" : `Run — ${assigneeLabel}`}
      </button>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {gate ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            gate.status === "pass"
              ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30"
              : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30"
          }`}
        >
          <p className={`font-semibold ${gate.status === "pass" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-800 dark:text-amber-300"}`}>
            {gate.status === "pass" ? t("pages.skillRun.gatePassed") : t("pages.skillRun.gateFlagged")}
          </p>
          {gate.issues.length > 0 ? (
            <ul className="mt-2 space-y-1.5 text-slate-700 dark:text-slate-300">
              {gate.issues.map((it, i) => (
                <li key={i}>
                  <span className="font-medium">{it.issue}</span>
                  {it.rewrite ? <span className="text-slate-500 dark:text-slate-400"> → {it.rewrite}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {output ? (
        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("pages.skillRunner.output")}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(output);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              {copied ? t("pages.skillRunner.copied") : t("pages.skillRunner.copy")}
            </button>
          </div>
          <div className="whitespace-pre-wrap p-4 text-sm text-slate-800 dark:text-slate-200">{output}</div>
        </div>
      ) : null}
    </div>
  );
}
