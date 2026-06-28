"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
      setError("Enter the property address.");
      return;
    }
    const lp = Number(listPrice);
    if (!Number.isFinite(lp) || lp <= 0) {
      setError("Enter a valid list price.");
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
      if (!res.ok || !body.ok || !body.offer) throw new Error(body.error ?? "Could not build the offer.");
      setResult(body.offer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the offer.");
    } finally {
      setBuilding(false);
    }
  }

  async function saveDraft() {
    if (!result) return;
    setError(null);
    if (!contact?.id) {
      setError("Pick the buyer before saving.");
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
      if (!res.ok || !body.ok || !body.offer) throw new Error(body.error ?? "Failed to save offer.");
      router.push(`/dashboard/offers/${body.offer.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/offers" className="hover:underline">
            Offers
          </Link>
          {" / Build with AI"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Build an offer with AI</h1>
        <p className="mt-1 text-sm text-slate-500">
          Get recommended terms — price, earnest money, contingency strategy, escalation, and a
          buyer cover letter — for a competitive but sound offer. You review and save as a draft.
        </p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-700">Buyer *</label>
          <ContactPicker value={contact} onChange={setContact} helperText="Who is this offer for?" className="mt-1" />
        </div>
        <Field label="Property address *" value={address} onChange={setAddress} placeholder="123 Main St, Los Angeles, CA" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="List price *" value={listPrice} onChange={setListPrice} type="number" placeholder="1250000" />
          <Field label="Your CMA value (optional)" value={estimatedValue} onChange={setEstimatedValue} type="number" placeholder="1220000" />
          <Field label="Buyer max budget (optional)" value={buyerMaxBudget} onChange={setBuyerMaxBudget} type="number" placeholder="1300000" />
          <div>
            <label className="block text-xs font-medium text-slate-700">Financing</label>
            <select
              value={financingType}
              onChange={(e) => setFinancingType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="cash">Cash</option>
              <option value="conventional">Conventional</option>
              <option value="fha">FHA</option>
              <option value="va">VA</option>
              <option value="jumbo">Jumbo</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700">Market</label>
            <select
              value={marketHeat}
              onChange={(e) => setMarketHeat(e.target.value as "" | "hot" | "balanced" | "cool")}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="hot">Hot (seller's market)</option>
              <option value="balanced">Balanced</option>
              <option value="cool">Cool (buyer's market)</option>
            </select>
          </div>
          <Field label="Competing offers (optional)" value={competingOffers} onChange={setCompetingOffers} type="number" placeholder="3" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700">Buyer notes (optional)</label>
          <textarea
            value={motivation}
            onChange={(e) => setMotivation(e.target.value)}
            rows={2}
            placeholder="e.g. loves the home and will compete; or value buyer, won't overpay."
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Link href="/dashboard/offers" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Cancel
          </Link>
          <button
            type="button"
            onClick={() => void build()}
            disabled={building || !address.trim() || !listPrice.trim()}
            className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white hover:bg-[#005fa8] disabled:opacity-50"
          >
            {building ? "Building…" : result ? "Rebuild" : "Build with AI"}
          </button>
        </div>
      </div>

      {result ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Recommended offer</h2>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
              {result.strategy}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Offer price" value={money(result.offerPrice)} highlight />
            <Stat label="Earnest money" value={money(result.earnestMoney)} />
            <Stat label="Down payment" value={money(result.downPayment)} />
            <Stat label="Financing" value={result.financingType ?? "—"} />
            <Stat label="Escalation cap" value={money(result.escalationCap)} />
            <Stat label="Close in" value={result.closeDays ? `${result.closeDays} days` : "—"} />
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            {(["inspection", "appraisal", "loan"] as const).map((k) => {
              const keep = result.contingencies[k] === "keep";
              return (
                <span
                  key={k}
                  className={`rounded-full px-2 py-0.5 font-medium ${keep ? "bg-slate-100 text-slate-700" : "bg-amber-100 text-amber-800"}`}
                >
                  {k}: {keep ? "keep" : "WAIVE"}
                </span>
              );
            })}
          </div>
          {result.rationale ? <p className="text-sm leading-relaxed text-slate-700">{result.rationale}</p> : null}
          {result.coverLetter ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Buyer cover letter</p>
              <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{result.coverLetter}</p>
            </div>
          ) : null}
          <p className="text-[10px] italic text-slate-400">{result.disclaimer}</p>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => void saveDraft()}
              disabled={saving || !contact?.id}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save as draft offer"}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            Saving creates a <strong>draft</strong> offer you can edit before submitting.
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
