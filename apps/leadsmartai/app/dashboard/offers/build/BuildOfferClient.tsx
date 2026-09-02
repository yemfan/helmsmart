"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import ContactPicker, { type ContactPickerValue } from "@/components/crm/ContactPicker";

type BuiltOffer = {
  strategy: "aggressive" | "market" | "conservative";
  offerPrice: number;
  earnestMoney: number | null;
  downPayment: number | null;
  financingType: string | null;
  escalationCap: number | null;
  closeDays: number | null;
  contingencies: { inspection: "keep" | "waive"; appraisal: "keep" | "waive"; loan: "keep" | "waive" };
  rationale: string;
  coverLetter: string;
  disclaimer: string;
};

function money(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

export function BuildOfferClient() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [contact, setContact] = useState<ContactPickerValue | null>(null);
  const [address, setAddress] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [buyerMaxBudget, setBuyerMaxBudget] = useState("");
  const [financingType, setFinancingType] = useState("");
  const [marketHeat, setMarketHeat] = useState<"" | "hot" | "balanced" | "cool">("");
  const [competingOffers, setCompetingOffers] = useState("");
  const [motivation, setMotivation] = useState("");

  const [building, setBuilding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BuiltOffer | null>(null);

  async function build() {
    setError(null);
    if (!address.trim()) {
      setError(t("pages.buildOffer.needAddress"));
      return;
    }
    const lp = Number(listPrice);
    if (!Number.isFinite(lp) || lp <= 0) {
      setError(t("pages.buildOffer.needPrice"));
      return;
    }
    setBuilding(true);
    try {
      const res = await fetch("/api/dashboard/offers/build", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: address.trim(),
          listPrice: lp,
          estimatedValue: estimatedValue ? Number(estimatedValue) : null,
          buyerMaxBudget: buyerMaxBudget ? Number(buyerMaxBudget) : null,
          financingType: financingType || null,
          marketHeat: marketHeat || null,
          competingOffers: competingOffers ? Number(competingOffers) : null,
          motivation: motivation.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; offer?: BuiltOffer; error?: string };
      if (!res.ok || !body.ok || !body.offer) throw new Error(body.error ?? t("pages.buildOffer.buildFailed"));
      setResult(body.offer);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pages.buildOffer.buildFailed"));
    } finally {
      setBuilding(false);
    }
  }

  async function saveDraft() {
    if (!result) return;
    setError(null);
    if (!contact?.id) {
      setError(t("pages.buildOffer.needBuyer"));
      return;
    }
    setSaving(true);
    try {
      const closeDate = result.closeDays
        ? new Date(Date.now() + result.closeDays * 86400000).toISOString().slice(0, 10)
        : null;
      const notes = [
        result.rationale,
        result.escalationCap ? `Escalation cap: ${money(result.escalationCap)}.` : "",
        result.coverLetter ? `\n\nCover letter:\n${result.coverLetter}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 4000);

      const res = await fetch("/api/dashboard/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          propertyAddress: address.trim(),
          listPrice: Number(listPrice) || null,
          offerPrice: result.offerPrice,
          earnestMoney: result.earnestMoney,
          downPayment: result.downPayment,
          financingType: result.financingType,
          closingDateProposed: closeDate,
          // offers POST expects "kept" booleans (true = contingency retained).
          inspectionContingency: result.contingencies.inspection === "keep",
          appraisalContingency: result.contingencies.appraisal === "keep",
          loanContingency: result.contingencies.loan === "keep",
          notes,
          submitNow: false,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; offer?: { id: string }; error?: string };
      if (!res.ok || !body.ok || !body.offer) throw new Error(body.error ?? t("pages.buildOffer.saveFailed"));
      router.push(`/dashboard/offers/${body.offer.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pages.buildOffer.networkError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/offers" className="hover:underline">{t("pages.buildOffer.offers")}</Link>
          {" / Build with AI"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{t("pages.buildOffer.heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.buildOffer.sub")}</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.buildOffer.buyer")}</label>
          <ContactPicker value={contact} onChange={setContact} helperText="Who is this offer for?" className="mt-1" />
        </div>
        <Field label={t("pages.buildOffer.address")} value={address} onChange={setAddress} placeholder={t("pages.buildOffer.addressPlaceholder")} />
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("pages.buildOffer.listPrice")} value={listPrice} onChange={setListPrice} type="number" placeholder="1250000" />
          <Field label={t("pages.buildOffer.cmaValue")} value={estimatedValue} onChange={setEstimatedValue} type="number" placeholder="1220000" />
          <Field label={t("pages.buildOffer.maxBudget")} value={buyerMaxBudget} onChange={setBuyerMaxBudget} type="number" placeholder="1300000" />
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.buildOffer.financing")}</label>
            <select
              value={financingType}
              onChange={(e) => setFinancingType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="cash">{t("pages.buildOffer.cash")}</option>
              <option value="conventional">{t("pages.buildOffer.conventional")}</option>
              <option value="fha">{t("pages.buildOffer.fha")}</option>
              <option value="va">VA</option>
              <option value="jumbo">{t("pages.buildOffer.jumbo")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.buildOffer.market")}</label>
            <select
              value={marketHeat}
              onChange={(e) => setMarketHeat(e.target.value as "" | "hot" | "balanced" | "cool")}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="hot">{t("pages.buildOffer.marketHot")}</option>
              <option value="balanced">{t("pages.buildOffer.marketBalanced")}</option>
              <option value="cool">{t("pages.buildOffer.marketCool")}</option>
            </select>
          </div>
          <Field label={t("pages.buildOffer.competingOffers")} value={competingOffers} onChange={setCompetingOffers} type="number" placeholder="3" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">{t("pages.buildOffer.buyerNotes")}</label>
          <textarea
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            rows={2}
            placeholder={t("pages.buildOffer.buyerNotesPlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Link href="/dashboard/offers" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">{t("pages.buildOffer.cancel")}</Link>
          <button
            type="button"
            onClick={() => void build()}
            disabled={building || !address.trim() || !listPrice.trim()}
            className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005fa8] disabled:opacity-50"
          >
            {building ? t("pages.buildOffer.building") : result ? t("pages.buildOffer.rebuild") : t("pages.buildOffer.build")}
          </button>
        </div>
      </div>

      {result ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{t("pages.buildOffer.recommended")}</h2>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
              {result.strategy}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label={t("pages.buildOffer.offerPrice")} value={money(result.offerPrice)} highlight />
            <Stat label={t("pages.buildOffer.earnestMoney")} value={money(result.earnestMoney)} />
            <Stat label={t("pages.buildOffer.downPayment")} value={money(result.downPayment)} />
            <Stat label={t("pages.labels.financing")} value={result.financingType ?? "—"} />
            <Stat label={t("pages.buildOffer.escalationCap")} value={money(result.escalationCap)} />
            <Stat label={t("pages.buildOffer.closeIn")} value={result.closeDays ? t("pages.buildOffer.closeDays", { count: result.closeDays }) : "—"} />
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {(["inspection", "appraisal", "loan"] as const).map((k) => {
              const keep = result.contingencies[k] === "keep";
              return (
                <span
                  key={k}
                  className={`rounded-full px-2 py-0.5 font-medium ${keep ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"}`}
                >
                  {k}: {keep ? t("pages.buildOffer.keep") : t("pages.buildOffer.waive")}
                </span>
              );
            })}
          </div>
          {result.rationale ? <p className="text-sm leading-relaxed text-slate-700">{result.rationale}</p> : null}
          {result.coverLetter ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t("pages.buildOffer.coverLetter")}</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{result.coverLetter}</p>
            </div>
          ) : null}
          <p className="text-[10px] italic text-slate-400">{t("disclaimers.buildOffer")}</p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving || !contact?.id}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? t("pages.buildOffer.saving") : t("pages.buildOffer.saveDraft")}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            {t("pages.buildOffer.draftBefore")} <strong>draft</strong>{t("pages.buildOffer.draftAfter")}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700">{label}</label>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
      />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${highlight ? "text-[#0072ce]" : "text-slate-900"}`}>{value}</div>
    </div>
  );
}
