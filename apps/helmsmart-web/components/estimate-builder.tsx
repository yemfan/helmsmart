"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, Sparkles } from "lucide-react";
import { moneyFormatter } from "@/lib/books-format";
import { createEstimate, generateEstimateLines, type EstimateLine } from "@/lib/actions/estimates";
import { createEstimateTemplate, type EstimateTemplate } from "@/lib/actions/estimate-templates";

interface Client {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
}

interface Props {
  clients: Client[];
  preselectedClientId?: string;
  templates: EstimateTemplate[];
  /** `organizations.currency`, resolved on the server by the page. */
  currency: string;
}

function emptyLine(): EstimateLine & { key: string } {
  return {
    key: crypto.randomUUID(),
    description: "",
    quantity: 1,
    unit_price: 0,
    amount: 0,
  };
}

function defaultExpiryDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
}

export function EstimateBuilder({ clients, preselectedClientId, templates, currency }: Props) {
  const { t, i18n } = useTranslation("books");
  const fmt = moneyFormatter(i18n.language, currency);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [clientId, setClientId] = useState(preselectedClientId ?? "");
  const [expiryDate, setExpiryDate] = useState(defaultExpiryDate());
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<(EstimateLine & { key: string })[]>([
    emptyLine(),
  ]);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");

  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const taxAmount = +(subtotal * (taxRate / 100)).toFixed(2);
  const total = subtotal + taxAmount;

  function updateLine(key: string, field: string, raw: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const updated: EstimateLine & { key: string } = {
          ...l,
          [field]: raw,
        };
        if (field === "quantity" || field === "unit_price") {
          updated.quantity =
            field === "quantity" ? Number(raw) : l.quantity;
          updated.unit_price =
            field === "unit_price" ? Number(raw) : l.unit_price;
          updated.amount = +(updated.quantity * updated.unit_price).toFixed(2);
        }
        return updated;
      })
    );
  }

  function submit() {
    if (!expiryDate) {
      setError(t("estimates.builder.errors.expiryRequired"));
      return;
    }
    const validLines = lines.filter((l) => l.description.trim());
    if (!validLines.length) {
      setError(t("estimates.builder.errors.lineRequired"));
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const id = await createEstimate({
          clientId: clientId || null,
          expiryDate,
          taxRate: taxRate / 100,
          notes,
          lines: validLines,
        });
        router.push(`/books/estimates/${id}`);
      } catch (err) {
        console.error("save estimate", err);
        setError(t("common:errors.generic"));
      }
    });
  }

  function loadTemplate(templateId: string) {
    const tpl = templates.find((x) => x.id === templateId);
    if (!tpl) return;
    setError(null);
    const src = tpl.lines.length
      ? tpl.lines
      : [{ description: "", quantity: 1, unit_price: 0, amount: 0 }];
    setLines(
      src.map((l) => ({
        key: crypto.randomUUID(),
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        amount: l.amount,
      }))
    );
    setTaxRate((tpl.tax_rate ?? 0) * 100);
    setNotes(tpl.notes ?? "");
  }

  function saveAsTemplate() {
    const validLines = lines.filter((l) => l.description.trim());
    if (!validLines.length) {
      setError(t("estimates.builder.errors.linesBeforeTemplate"));
      return;
    }
    const name = window.prompt(t("estimates.builder.templateNamePrompt"));
    if (!name?.trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createEstimateTemplate({
          name: name.trim(),
          taxRate: taxRate / 100,
          notes: notes || null,
          lines: validLines.map((l) => ({
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            amount: l.amount,
          })),
        });
        setTemplateSaved(true);
        setTimeout(() => setTemplateSaved(false), 2500);
        router.refresh();
      } catch (e) {
        console.error("save estimate template", e);
        setError(t("estimates.builder.errors.templateSaveFailed"));
      }
    });
  }

  function generateDraft() {
    if (!aiPrompt.trim()) return;
    setAiError("");
    setAiLoading(true);
    (async () => {
      try {
        const result = await generateEstimateLines({ prompt: aiPrompt.trim() });
        setLines(
          result.lines.map((l) => ({
            key: crypto.randomUUID(),
            description: l.description,
            quantity: l.quantity,
            unit_price: l.unit_price,
            amount: +(l.quantity * l.unit_price).toFixed(2),
          }))
        );
        if (result.note) setNotes(result.note);
        setError(null);
      } catch (e) {
        console.error("draft estimate with AI", e);
        setAiError(t("estimates.builder.errors.draftFailed"));
      } finally {
        setAiLoading(false);
      }
    })();
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      {/* AI draft */}
      <div className="mb-6 pb-6 border-b border-slate-100">
        <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
          {t("estimates.builder.aiLabel")}
        </label>
        <div className="flex gap-2">
          <input
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={t("estimates.builder.aiPlaceholder")}
            className="flex-1 text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={generateDraft}
            disabled={aiLoading || !aiPrompt.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <Sparkles className="w-4 h-4" />
            {aiLoading ? t("common:status.drafting") : t("estimates.builder.aiDraft")}
          </button>
        </div>
        {aiError && <p className="text-xs text-rose-600 mt-1.5">{aiError}</p>}
        <p className="text-[11px] text-slate-400 mt-1.5">
          {t("estimates.builder.aiHint")}
        </p>
      </div>

      {templates.length > 0 && (
        <div className="mb-6 pb-6 border-b border-slate-100">
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            {t("estimates.builder.startFromTemplate")}
          </label>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) loadTemplate(e.target.value);
            }}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">{t("estimates.builder.blankEstimate")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        {/* Client */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            {t("estimates.builder.client")}
          </label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="">{t("estimates.builder.noClient")}</option>
            {clients.map((c) => {
              const name =
                [c.first_name, c.last_name].filter(Boolean).join(" ") ||
                c.company ||
                c.id;
              return (
                <option key={c.id} value={c.id}>
                  {name} {c.email ? `(${c.email})` : ""}
                </option>
              );
            })}
          </select>
        </div>

        {/* Expiry date */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            {t("estimates.builder.validUntil")}
          </label>
          <input
            type="date"
            required
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Line items */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
            {t("estimates.builder.lineItems")}
          </h3>
          <button
            type="button"
            onClick={() => setLines((p) => [...p, emptyLine()])}
            className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
          >
            <Plus className="w-3 h-3" /> {t("estimates.builder.addLine")}
          </button>
        </div>

        {/* The line table keeps its columns and scrolls inside itself on a phone. */}
        <div className="overflow-x-auto">
        <div className="min-w-[32rem]">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_100px_100px_36px] gap-3 mb-2 px-1">
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
            {t("estimates.builder.columns.description")}
          </span>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
            {t("estimates.builder.columns.qty")}
          </span>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide">
            {t("estimates.builder.columns.unitPrice")}
          </span>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wide text-right">
            {t("estimates.builder.columns.amount")}
          </span>
        </div>

        <div className="space-y-2">
          {lines.map((line) => (
            <div
              key={line.key}
              className="grid grid-cols-[1fr_80px_100px_100px_36px] gap-3 items-center"
            >
              <input
                type="text"
                value={line.description}
                onChange={(e) =>
                  updateLine(line.key, "description", e.target.value)
                }
                placeholder={t("estimates.builder.descriptionPlaceholder")}
                className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="number"
                value={line.quantity}
                onChange={(e) =>
                  updateLine(line.key, "quantity", e.target.value)
                }
                min={1}
                step={1}
                className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-center"
              />
              <input
                type="number"
                value={line.unit_price}
                onChange={(e) =>
                  updateLine(line.key, "unit_price", e.target.value)
                }
                min={0}
                step={0.01}
                placeholder="0.00"
                className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="text-sm text-slate-700 font-medium tabular-nums text-right pr-1">
                {fmt(line.amount)}
              </div>
              <button
                type="button"
                onClick={() =>
                  setLines((p) => p.filter((l) => l.key !== line.key))
                }
                disabled={lines.length === 1}
                className="p-1.5 text-slate-300 hover:text-rose-500 disabled:opacity-20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        </div>
        </div>
      </div>

      {/* Tax + totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1.5">
            {t("estimates.builder.taxRate")}
          </label>
          <input
            type="number"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            min={0}
            max={100}
            step={0.01}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="bg-slate-50 rounded-xl p-4 text-sm space-y-2">
          <div className="flex justify-between text-slate-600">
            <span>{t("estimates.builder.subtotal")}</span>
            <span className="tabular-nums">{fmt(subtotal)}</span>
          </div>
          {taxRate > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>{t("estimates.builder.taxWithRate", { rate: taxRate })}</span>
              <span className="tabular-nums">{fmt(taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold text-slate-900 border-t border-slate-200 pt-2">
            <span>{t("estimates.builder.total")}</span>
            <span className="tabular-nums font-mono">{fmt(total)}</span>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          {t("estimates.builder.notes")}{" "}
          <span className="text-slate-400 font-normal">
            {t("estimates.builder.optional")}
          </span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={t("estimates.builder.notesPlaceholder")}
          className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
        />
      </div>

      {error && (
        <p className="text-xs text-rose-600 bg-rose-50 rounded-lg px-3 py-2 mb-4" role="alert">
          {error}
        </p>
      )}

      {/* Action */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={saveAsTemplate}
          disabled={isPending}
          className="text-sm font-medium text-slate-500 hover:text-indigo-600 disabled:opacity-50 transition-colors"
        >
          {templateSaved
            ? t("estimates.builder.templateSaved")
            : t("estimates.builder.saveAsTemplate")}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="px-6 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors"
        >
          {isPending ? t("common:status.creating") : t("estimates.builder.create")}
        </button>
      </div>
    </div>
  );
}
