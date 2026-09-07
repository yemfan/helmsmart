"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PhoneOutgoing, Search, Users, AlertTriangle, ClipboardList, Megaphone } from "lucide-react";
import { LoadingText } from "@/components/ui/LoadingText";

type PickContact = { id: string; name: string; phone: string };
type CallResult = { id: string; name: string; phone: string | null; ok: boolean; error?: string };
type Purpose = "follow_up" | "survey" | "promo";

const MAX_BULK = 25;
const PURPOSES: { key: Purpose; label: string; icon: typeof Users }[] = [
  { key: "follow_up", label: "Follow-up", icon: Users },
  { key: "survey", label: "Survey / review", icon: ClipboardList },
  { key: "promo", label: "Promo / announcement", icon: Megaphone },
];

/**
 * Bulk AI calling — select multiple CRM contacts and have Lucy call each one.
 * Capped at MAX_BULK per batch. Mirrors the single Outbound call but fans out.
 */
export default function BulkCallPanel() {
  const { t } = useTranslation("dashboard");
  const [contacts, setContacts] = useState<PickContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<"idle" | "calling" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [results, setResults] = useState<CallResult[] | null>(null);
  const [purpose, setPurpose] = useState<Purpose>("follow_up");
  const [detail, setDetail] = useState("");
  const needsDetail = purpose === "survey" || purpose === "promo";

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/voice/contacts");
        const data = (await res.json()) as { contacts?: PickContact[] };
        if (alive) setContacts(Array.isArray(data.contacts) ? data.contacts : []);
      } catch {
        if (alive) setContacts([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    if (!q) return contacts;
    return contacts.filter((c) => {
      const nameHit = c.name.toLowerCase().includes(q);
      const phoneHit = digits.length > 0 && c.phone.replace(/\D/g, "").includes(digits);
      return nameHit || phoneHit;
    });
  }, [contacts, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_BULK) next.add(id);
      return next;
    });
    setConfirming(false);
  }

  function selectAllFiltered() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of filtered) {
        if (next.size >= MAX_BULK) break;
        next.add(c.id);
      }
      return next;
    });
    setConfirming(false);
  }

  function clearSel() {
    setSelected(new Set());
    setConfirming(false);
  }

  async function runBulk() {
    if (selected.size === 0 || status === "calling") return;
    if (needsDetail && !detail.trim()) {
      setStatus("error");
      setMessage(purpose === "survey" ? "Add the survey questions first." : "Add the announcement message first.");
      setConfirming(false);
      return;
    }
    setStatus("calling");
    setMessage(null);
    setResults(null);
    try {
      const res = await fetch("/api/dashboard/voice/outbound-call/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactIds: Array.from(selected),
          purpose,
          detail: needsDetail ? detail.trim() : undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        placed?: number;
        failed?: number;
        total?: number;
        results?: CallResult[];
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Bulk call failed.");
      setStatus("done");
      setResults(data.results ?? []);
      setMessage(`Placed ${data.placed ?? 0} of ${data.total ?? 0} calls${data.failed ? ` · ${data.failed} failed` : ""}.`);
      setSelected(new Set());
      setConfirming(false);
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Bulk call failed.");
    }
  }

  const atCap = selected.size >= MAX_BULK;

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-slate-500" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.bulkCall.title")}</h2>
      </div>
      <p className="mt-0.5 mb-3 text-xs text-slate-500">{t("pages.dashFragments.lucyCalls")} {MAX_BULK} {t("pages.dashFragments.perBatchDiscloses")}</p>

      {/* Purpose picker */}
      <div className="mb-2 flex flex-wrap gap-2">
        {PURPOSES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setPurpose(key);
              setStatus("idle");
              setMessage(null);
              setConfirming(false);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              purpose === key
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {needsDetail && (
        <div className="mb-3">
          <span className="mb-1 block text-[11px] font-medium text-slate-500">
            {purpose === "survey" ? t("pages.bulkCall.whatShouldLucyAsk") : t("pages.bulkCall.whatSTheAnnouncement")}
          </span>
          <textarea
            className="w-full resize-y rounded-lg border border-slate-300 dark:border-slate-700 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
            rows={2}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={
              purpose === "survey"
                ? t("pages.bulkCall.surveyPlaceholder")
                : t("pages.bulkCall.promoPlaceholder")
            }
          />
        </div>
      )}

      {/* Search + bulk actions */}
      <div className="mb-2 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
          <input
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={loading ? t("pages.bulkCall.loadingContacts") : t("pages.bulkCall.searchPlaceholder")}
            disabled={loading}
          />
        </div>
        <button
          type="button"
          onClick={selectAllFiltered}
          disabled={loading || filtered.length === 0 || atCap}
          className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        >{t("pages.bulkCall.selectAll")}</button>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={clearSel}
            className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >{t("pages.bulkCall.clear")}</button>
        )}
      </div>

      {/* Contact list */}
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-400"><LoadingText /></p>
      ) : contacts.length === 0 ? (
        <p className="rounded-lg bg-slate-50 dark:bg-slate-900/60 px-3 py-6 text-center text-sm text-slate-500">{t("pages.bulkCall.noContacts")}</p>
      ) : (
        <ul className="max-h-64 divide-y divide-slate-100 dark:divide-slate-800 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-center text-xs text-slate-400">{t("pages.bulkCall.noMatches")}</li>
          ) : (
            filtered.map((c) => {
              const checked = selected.has(c.id);
              const disabled = !checked && atCap;
              return (
                <li key={c.id}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm ${
                      disabled ? "opacity-40" : "hover:bg-blue-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(c.id)}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-400"
                    />
                    <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{c.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{c.phone}</span>
                  </label>
                </li>
              );
            })
          )}
        </ul>
      )}

      {atCap && (
        <p className="mt-2 text-[11px] font-medium text-amber-600">{t("pages.dashFragments.batchLimit")}{MAX_BULK}). Clear some to pick others.
        </p>
      )}

      {/* Consent guardrail */}
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        <span>{t("pages.bulkCall.tcpaWarning")}</span>
      </div>

      {/* Action */}
      <div className="mt-4 flex items-center gap-3">
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={selected.size === 0 || status === "calling"}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            <PhoneOutgoing className="h-4 w-4" strokeWidth={2} />
            {selected.size > 0 ? `Call ${selected.size} contact${selected.size === 1 ? "" : "s"}` : t("pages.bulkCall.callContacts")}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void runBulk()}
              disabled={status === "calling"}
              className="inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
            >
              <PhoneOutgoing className="h-4 w-4" strokeWidth={2} />
              {status === "calling" ? `Placing ${selected.size} calls…` : `Confirm — call ${selected.size} now`}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={status === "calling"}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
            >{t("pages.bulkCall.cancel")}</button>
          </>
        )}
        {message && (
          <span className={`text-xs font-medium ${status === "error" ? "text-rose-600" : "text-emerald-600"}`}>
            {message}
          </span>
        )}
      </div>

      {/* Per-contact results */}
      {results && results.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
          {results.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
              <span className={r.ok ? "text-emerald-600" : "text-rose-600"} aria-hidden>
                {r.ok ? "✓" : "✕"}
              </span>
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-300">{r.name || r.phone}</span>
              <span className="shrink-0 text-slate-400">{r.ok ? "calling" : (r.error ?? "failed")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
