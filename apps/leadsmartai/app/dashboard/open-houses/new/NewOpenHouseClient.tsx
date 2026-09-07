"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import AddressAutocomplete, {
  type AddressAutocompleteValue,
} from "@/components/AddressAutocomplete";

/**
 * Status banner colors mirror the showings/new tones — green for an
 * active listing, amber for off-market / pending / unknown, slate for
 * "we couldn't reach the property service" so the agent can still
 * fill the form manually.
 */
type StatusBanner = { tone: "ok" | "warn" | "info"; text: string };

const ACTIVE_STATUS_RE = /^(active|active_under_contract|coming_soon|new)$/i;

/** Try a few common naming variants from the Rentcast snapshot blob. */
function readBlobString(blob: unknown, ...keys: string[]): string | null {
  if (!blob || typeof blob !== "object") return null;
  const obj = blob as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function readBlobNumber(blob: unknown, ...keys: string[]): number | null {
  if (!blob || typeof blob !== "object") return null;
  const obj = blob as Record<string, unknown>;
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function defaultDateIso(): string {
  // Saturday of this week — open houses are usually weekend events.
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const daysUntilSat = (6 - day + 7) % 7 || 7; // always next Sat
  d.setDate(d.getDate() + daysUntilSat);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

const WEEKDAYS = [
  { n: 0, label: "Sun" },
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
];

export function NewOpenHouseClient() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();

  const [propertyAddress, setPropertyAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setStateValue] = useState("CA");
  const [zip, setZip] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [mlsNumber, setMlsNumber] = useState("");
  const [mlsUrl, setMlsUrl] = useState("");
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [date, setDate] = useState(defaultDateIso());
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("16:00");
  const [hostNotes, setHostNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recurrence controls
  const [isRecurring, setIsRecurring] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([6]); // Sat by default
  const [weeks, setWeeks] = useState(4);

  const { startAtIso, endAtIso } = useMemo(() => {
    if (!date || !startTime || !endTime) return { startAtIso: null, endAtIso: null };
    const start = new Date(`${date}T${startTime}:00`);
    const end = new Date(`${date}T${endTime}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { startAtIso: null, endAtIso: null };
    }
    return { startAtIso: start.toISOString(), endAtIso: end.toISOString() };
  }, [date, startTime, endTime]);

  const projectedCount = useMemo(() => {
    if (!isRecurring) return 1;
    return Math.min(26, Math.max(0, weekdays.length * weeks));
  }, [isRecurring, weekdays, weeks]);

  async function submit() {
    setError(null);
    if (!propertyAddress.trim() || !date || !startTime || !endTime) {
      setError(t("pages.newOpenHouse.errRequired"));
      return;
    }
    if (isRecurring) {
      if (!weekdays.length) {
        setError(t("pages.newOpenHouse.errWeekday"));
        return;
      }
      if (weeks <= 0) {
        setError(t("pages.newOpenHouse.errWeeks"));
        return;
      }
    } else {
      if (!startAtIso || !endAtIso) {
        setError(t("pages.newOpenHouse.errDateTime"));
        return;
      }
      if (new Date(endAtIso).getTime() <= new Date(startAtIso).getTime()) {
        setError(t("pages.newOpenHouse.errEndBeforeStart"));
        return;
      }
    }
    setSubmitting(true);
    try {
      const base = {
        propertyAddress: propertyAddress.trim(),
        city: city.trim() || null,
        state: state.trim() || null,
        zip: zip.trim() || null,
        mlsNumber: mlsNumber.trim() || null,
        mlsUrl: mlsUrl.trim() || null,
        listPrice: listPrice ? Number(listPrice) : null,
        hostNotes: hostNotes.trim() || null,
      };
      const body = isRecurring
        ? {
            ...base,
            recurrence: {
              kind: "weekly" as const,
              anchorDate: date,
              weekdays,
              weeks,
              startTime,
              endTime,
            },
          }
        : {
            ...base,
            startAt: startAtIso,
            endAt: endAtIso,
          };
      const res = await fetch("/api/dashboard/open-houses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        openHouse?: { id: string };
        openHouses?: Array<{ id: string }>;
        recurring?: boolean;
        count?: number;
        error?: string;
      };
      if (!res.ok || !payload.ok) {
        setError(payload.error ?? "Failed to schedule.");
        return;
      }
      // Recurring: jump to the list so all N show up with the series badge.
      // Single: jump to the detail page.
      if (payload.recurring && payload.openHouses?.length) {
        router.push("/dashboard/open-houses");
      } else if (payload.openHouse) {
        router.push(`/dashboard/open-houses/${payload.openHouse.id}`);
      } else {
        router.push("/dashboard/open-houses");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * After Google Places returns a chosen Place, copy the parsed
   * city/state/zip into the form, then look up the listing via
   * `/api/property/[address]` so the agent doesn't have to retype
   * MLS#, list price, or the listing URL. Mirrors the showings/new
   * onAddressPick contract — see NewShowingClient.tsx.
   */
  async function onAddressPick(val: AddressAutocompleteValue) {
    setPropertyAddress(val.formattedAddress);
    if (val.components.city) setCity(val.components.city);
    if (val.components.state) setStateValue(val.components.state);
    if (val.components.zip) setZip(val.components.zip);

    setStatusBanner(null);
    setLookupLoading(true);
    try {
      const res = await fetch(
        `/api/property/${encodeURIComponent(val.formattedAddress)}`,
      );
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        latest_snapshot?: {
          listing_status?: string | null;
          data?: unknown;
        } | null;
      };
      if (!res.ok || !body.ok) {
        setStatusBanner({
          tone: "info",
          text: t("pages.newOpenHouse.lookupFailed"),
        });
        return;
      }

      const status = body.latest_snapshot?.listing_status?.trim() || null;
      if (status) {
        if (ACTIVE_STATUS_RE.test(status)) {
          setStatusBanner({ tone: "ok", text: `Listing status: ${status}` });
        } else {
          setStatusBanner({
            tone: "warn",
            text: `Heads up — this listing is ${status}, not Active. Confirm before scheduling the open house.`,
          });
        }
      } else {
        setStatusBanner({
          tone: "info",
          text: t("pages.newOpenHouse.noMls"),
        });
      }

      // Best-effort prefill from the snapshot blob. Only fill fields
      // the agent hasn't already typed into so we don't clobber a
      // manual override.
      const blob = body.latest_snapshot?.data;
      const price = readBlobNumber(blob, "price", "listPrice", "list_price");
      if (price != null && !listPrice) setListPrice(String(price));
      const mls = readBlobString(blob, "mlsNumber", "mls_number", "mls", "mlsId");
      if (mls && !mlsNumber) setMlsNumber(mls);
      const url = readBlobString(blob, "listingUrl", "listing_url", "url");
      if (url && !mlsUrl) setMlsUrl(url);
    } catch {
      setStatusBanner({
        tone: "info",
        text: t("pages.newOpenHouse.serviceDown"),
      });
    } finally {
      setLookupLoading(false);
    }
  }

  const toggleWeekday = (n: number) => {
    setWeekdays((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort(),
    );
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/dashboard/open-houses" className="hover:underline">{t("pages.newOpenHouse.openHouses")}</Link>
          {" / New"}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("pages.newOpenHouse.heading")}</h1>
        <p className="mt-1 text-sm text-slate-500">{t("pages.newOpenHouse.afterSaving")}</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.address")}</label>
          <AddressAutocomplete
            value={propertyAddress}
            onChange={(next) => {
              setPropertyAddress(next);
              // Clear any stale auto-fill banner when the agent edits
              // the typed address directly (re-fetch only happens on
              // a Places pick, so we don't keep showing "status: Active"
              // for the old address).
              if (statusBanner) setStatusBanner(null);
            }}
            onSelect={onAddressPick}
            placeholder={t("pages.newOpenHouse.addressHint")}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
          />
          {(city || state || zip) ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              {city ? <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{city}</span> : null}
              {state ? <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{state}</span> : null}
              {zip ? <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5">{zip}</span> : null}
            </div>
          ) : null}
          {lookupLoading ? (
            <p className="mt-1.5 text-[11px] text-slate-500">{t("pages.newOpenHouse.lookingUp")}</p>
          ) : null}
          {statusBanner ? (
            <div
              role="status"
              className={`mt-2 rounded-lg border px-3 py-2 text-[12px] ${
                statusBanner.tone === "ok"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : statusBanner.tone === "warn"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300"
              }`}
            >
              {statusBanner.text}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.listPrice")}</label>
            <input
              type="number"
              value={listPrice}
              onChange={(e) => setListPrice(e.target.value)}
              placeholder="1250000"
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.mls")}</label>
            <input
              value={mlsNumber}
              onChange={(e) => setMlsNumber(e.target.value)}
              placeholder={t("pages.newOpenHouse.mlsPlaceholder")}
              className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.listingUrl")}</label>
          <input
            value={mlsUrl}
            onChange={(e) => setMlsUrl(e.target.value)}
            placeholder={t("pages.newOpenHouse.urlPlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-slate-500">{t("pages.newOpenHouse.listingUrlHint")}</p>
        </div>

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 p-3">
          <div className="flex items-center gap-2">
            <input
              id="recurring-toggle"
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-700"
            />
            <label htmlFor="recurring-toggle" className="text-sm font-medium text-slate-800 dark:text-slate-200">{t("pages.newOpenHouse.recurring")}</label>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{t("pages.newOpenHouse.recurringHint")}</p>
        </div>

        {!isRecurring ? (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.date")}</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.start")}</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.end")}</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  First occurrence date *
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-500">{t("pages.newOpenHouse.anchorHint")}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Number of weeks *
                </label>
                <input
                  type="number"
                  min={1}
                  max={13}
                  value={weeks}
                  onChange={(e) => setWeeks(Math.max(1, Math.min(13, Number(e.target.value) || 1)))}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.weekdays")}</label>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {WEEKDAYS.map((w) => {
                  const selected = weekdays.includes(w.n);
                  return (
                    <button
                      key={w.n}
                      type="button"
                      onClick={() => toggleWeekday(w.n)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-medium ${ selected ? "border-slate-900 bg-[#0072ce] text-white" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800" }`}
                    >
                      {w.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.start")}</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.end")}</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
              {t("pages.newOpenHouse.willCreate")} <strong>{projectedCount}</strong>{" "}
              {t("pages.newOpenHouse.willCreateAfter", { count: projectedCount })}
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">{t("pages.newOpenHouse.hostNotes")}</label>
          <textarea
            value={hostNotes}
            onChange={(e) => setHostNotes(e.target.value)}
            rows={2}
            placeholder={t("pages.newOpenHouse.hostNotesPlaceholder")}
            className="mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-slate-500">{t("pages.newOpenHouse.copiedToAll")}</p>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Link
            href="/dashboard/open-houses"
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >{t("pages.newOpenHouse.cancel")}</Link>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !propertyAddress.trim() || projectedCount === 0}
            className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ca8] disabled:opacity-50"
          >
            {submitting
              ? t("common:status.creating")
              : isRecurring
                ? `Create ${projectedCount} open house${projectedCount === 1 ? "" : "s"}`
                : t("pages.newOpenHouse.createOpenHouse")}
          </button>
        </div>
      </div>
    </div>
  );
}
