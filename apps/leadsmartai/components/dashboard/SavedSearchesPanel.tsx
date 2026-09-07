"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { Bell, BellOff, Edit2, Plus, Trash2, X } from "lucide-react";
import type {
  AlertFrequency,
  SavedSearch,
  SavedSearchCriteria,
} from "@/lib/contacts/types";

type Props = {
  contactId: string;
};

/**
 * Saved-search manager for a single contact. Lists existing searches,
 * lets the agent add / edit / archive. The form is pragmatic rather
 * than exhaustive — captures the filters that matter for listing
 * alerts (location, price, beds, property type). Advanced filter
 * editing (sqft, lot size, keywords) is a follow-up.
 */
export default function SavedSearchesPanel({ contactId }: Props) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/saved-searches?contactId=${encodeURIComponent(contactId)}`,
      );
      const data = (await res.json()) as { ok?: boolean; searches?: SavedSearch[]; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
      setSearches(data.searches ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [contactId]);

  async function archive(id: string) {
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/saved-searches/${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      setSearches((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Archive failed");
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.savedSearches.heading")}</h2>
          <p className="mt-0.5 text-xs text-slate-500">{t("pages.savedSearches.intro")}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditingId("new")}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Plus className="h-3 w-3" aria-hidden />{t("pages.savedSearches.add")}</button>
      </div>

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="mt-3 text-xs text-slate-500">{t("pages.savedSearches.loading")}</div>
      ) : searches.length === 0 && editingId !== "new" ? (
        <div className="mt-3 rounded border border-dashed border-slate-200 dark:border-slate-700 p-4 text-center text-xs text-slate-500">
          {t("pages.savedSearches.emptyBefore")} <span className="font-medium">{t("pages.savedSearches.add")}</span>{t("pages.savedSearches.emptyAfter")}
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
          {searches.map((s) =>
            editingId === s.id ? (
              <li key={s.id} className="bg-slate-50 dark:bg-slate-900/60 p-3">
                <SearchForm
                  initial={s}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    setEditingId(null);
                    await load();
                  }}
                />
              </li>
            ) : (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {s.name}
                    </span>
                    <FrequencyBadge frequency={s.alertFrequency} />
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {summarizeCriteria(s.criteria) || t("pages.savedSearches.anyListing")}
                  </div>
                  {s.lastAlertedAt && (
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {t("pages.savedSearches.lastAlerted", {
                    date: new Date(s.lastAlertedAt).toLocaleDateString(locale),
                  })}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(s.id)}
                    aria-label={t("pages.savedSearches.edit")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => archive(s.id)}
                    aria-label={t("pages.savedSearches.archive")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </li>
            ),
          )}
          {editingId === "new" && (
            <li className="bg-slate-50 dark:bg-slate-900/60 p-3">
              <SearchForm
                contactId={contactId}
                onCancel={() => setEditingId(null)}
                onSaved={async () => {
                  setEditingId(null);
                  await load();
                }}
              />
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function FrequencyBadge({ frequency }: { frequency: AlertFrequency }) {
  const label =
    frequency === "never"
      ? "Paused"
      : frequency === "instant"
        ? "Instant"
        : frequency === "daily"
          ? "Daily"
          : "Weekly";
  const Icon = frequency === "never" ? BellOff : Bell;
  const classes =
    frequency === "never"
      ? "bg-slate-100 text-slate-500"
      : "bg-emerald-50 text-emerald-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${classes}`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden /> {label}
    </span>
  );
}

function summarizeCriteria(c: SavedSearchCriteria): string {
  const parts: string[] = [];
  if (c.propertyType && c.propertyType !== "any") {
    parts.push(c.propertyType.replace(/_/g, " "));
  }
  if (c.bedsMin) parts.push(`${c.bedsMin}+ bd`);
  if (c.bathsMin) parts.push(`${c.bathsMin}+ ba`);
  if (c.sqftMin) parts.push(`${c.sqftMin.toLocaleString()}+ sqft`);
  if (c.priceMin || c.priceMax) {
    const min = c.priceMin ? `$${(c.priceMin / 1000).toFixed(0)}k` : "any";
    const max = c.priceMax ? `$${(c.priceMax / 1000).toFixed(0)}k` : "any";
    parts.push(`${min}–${max}`);
  }
  const loc = [c.city, c.state, c.zip].filter(Boolean).join(" ").trim();
  if (loc) parts.push(loc);
  if (c.anchorAddress) parts.push(`near ${c.anchorAddress}`);
  return parts.join(" · ");
}

type SearchFormProps =
  | { initial: SavedSearch; contactId?: never; onCancel: () => void; onSaved: () => void }
  | { initial?: never; contactId: string; onCancel: () => void; onSaved: () => void };

function SearchForm(props: SearchFormProps) {
  const { t } = useTranslation("dashboard");
  const isEdit = "initial" in props && props.initial !== undefined;
  const seed = isEdit ? props.initial : null;
  const [name, setName] = useState(seed?.name ?? "");
  const [frequency, setFrequency] = useState<AlertFrequency>(
    seed?.alertFrequency ?? "daily",
  );
  const [criteria, setCriteria] = useState<SavedSearchCriteria>(
    seed?.criteria ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof SavedSearchCriteria>(key: K, value: SavedSearchCriteria[K]) {
    setCriteria((prev) => {
      const next = { ...prev };
      if (value === "" || value === null || value === undefined || Number.isNaN(value as number)) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        criteria,
        alertFrequency: frequency,
        ...(isEdit ? {} : { contactId: props.contactId }),
      };
      const url = isEdit
        ? `/api/dashboard/saved-searches/${encodeURIComponent(seed!.id)}`
        : "/api/dashboard/saved-searches";
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Save failed");
      props.onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {isEdit ? t("pages.savedSearches.editHeading") : t("pages.savedSearches.newHeading")}
        </span>
        <button
          type="button"
          onClick={props.onCancel}
          aria-label={t("pages.savedSearches.cancel")}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-200"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <label className="block">
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.name")}</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder={t("pages.savedSearches.namePlaceholder")}
          className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.city")}</span>
          <input
            value={criteria.city ?? ""}
            onChange={(e) => set("city", e.target.value)}
            placeholder={t("pages.savedSearches.cityPlaceholder")}
            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.state")}</span>
          <input
            value={criteria.state ?? ""}
            onChange={(e) => set("state", e.target.value.toUpperCase().slice(0, 2))}
            placeholder="CA"
            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.zip")}</span>
          <input
            value={criteria.zip ?? ""}
            onChange={(e) => set("zip", e.target.value.slice(0, 5))}
            placeholder="91754"
            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.propertyType")}</span>
          <select
            value={criteria.propertyType ?? "any"}
            onChange={(e) =>
              set("propertyType", e.target.value as SavedSearchCriteria["propertyType"])
            }
            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          >
            <option value="any">{t("pages.savedSearches.any")}</option>
            <option value="single_family">{t("pages.savedSearches.singleFamily")}</option>
            <option value="condo">{t("pages.savedSearches.condo")}</option>
            <option value="townhouse">{t("pages.savedSearches.townhouse")}</option>
            <option value="multi_family">{t("pages.savedSearches.multiFamily")}</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.priceMin")}</span>
          <input
            type="number"
            value={criteria.priceMin ?? ""}
            onChange={(e) => set("priceMin", e.target.value ? Number(e.target.value) : undefined)}
            placeholder="800000"
            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.priceMax")}</span>
          <input
            type="number"
            value={criteria.priceMax ?? ""}
            onChange={(e) => set("priceMax", e.target.value ? Number(e.target.value) : undefined)}
            placeholder="1200000"
            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.bedsMin")}</span>
          <input
            type="number"
            value={criteria.bedsMin ?? ""}
            onChange={(e) => set("bedsMin", e.target.value ? Number(e.target.value) : undefined)}
            placeholder="3"
            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.bathsMin")}</span>
          <input
            type="number"
            step="0.5"
            value={criteria.bathsMin ?? ""}
            onChange={(e) => set("bathsMin", e.target.value ? Number(e.target.value) : undefined)}
            placeholder="2"
            className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{t("pages.savedSearches.alertFrequency")}</span>
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as AlertFrequency)}
          className="mt-0.5 w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
        >
          <option value="instant">{t("pages.savedSearches.instant")}</option>
          <option value="daily">{t("pages.savedSearches.dailyDigest")}</option>
          <option value="weekly">{t("pages.savedSearches.weeklyDigest")}</option>
          <option value="never">{t("pages.savedSearches.paused")}</option>
        </select>
      </label>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="rounded bg-[#0072ce] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? t("common:status.saving") : isEdit ? t("common:actions.save_changes") : t("pages.savedSearches.createSearch")}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400"
        >{t("pages.savedSearches.cancel")}</button>
      </div>
    </form>
  );
}
