"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PhoneOutgoing, Search, User2, X, Users, ClipboardList, Megaphone } from "lucide-react";

type PickContact = { id: string; name: string; phone: string };

type Purpose = "follow_up" | "survey" | "promo";
const PURPOSES: { key: Purpose; label: string; icon: typeof Users }[] = [
  { key: "follow_up", label: "Follow-up", icon: Users },
  { key: "survey", label: "Survey / review", icon: ClipboardList },
  { key: "promo", label: "Promo / announcement", icon: Megaphone },
];

/**
 * Outbound AI calling. The AI receptionist (Lucy) dials a lead from your
 * receptionist number, discloses it's an AI, and follows up. Mirrors the
 * HelmSmart outbound console.
 *
 * Pick a CRM contact in one click (search by name or number → fills the
 * fields) or type an ad-hoc number.
 */
export default function OutboundCallPanel() {
  const { t } = useTranslation("dashboard");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<"idle" | "calling" | "placed" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<Purpose>("follow_up");
  const [detail, setDetail] = useState("");
  const needsDetail = purpose === "survey" || purpose === "promo";

  // Contact picker
  const [contacts, setContacts] = useState<PickContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

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
        if (alive) setLoadingContacts(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Close the dropdown on outside click.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const list = !q
      ? contacts
      : contacts.filter((c) => {
          const nameHit = c.name.toLowerCase().includes(q);
          const phoneHit = digits.length > 0 && c.phone.replace(/\D/g, "").includes(digits);
          return nameHit || phoneHit;
        });
    return list.slice(0, 8);
  }, [contacts, query]);

  function pick(c: PickContact) {
    setName(c.name === "Unnamed contact" ? "" : c.name);
    setPhone(c.phone);
    setPickedId(c.id);
    setQuery(c.name === "Unnamed contact" ? c.phone : c.name);
    setOpen(false);
    setStatus("idle");
    setMessage(null);
  }

  function clearPick() {
    setPickedId(null);
    setQuery("");
    setName("");
    setPhone("");
  }

  async function placeCall() {
    if (!phone.trim() || status === "calling") return;
    if (needsDetail && !detail.trim()) {
      setStatus("error");
      setMessage(purpose === "survey" ? t("pages.outboundCall.needSurvey") : t("pages.outboundCall.needAnnouncement"));
      return;
    }
    setStatus("calling");
    setMessage(null);
    try {
      const res = await fetch("/api/dashboard/voice/outbound-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          purpose,
          detail: needsDetail ? detail.trim() : undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; to?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to place the call.");
      setStatus("placed");
      setMessage(`Calling ${data.to}… Lucy will dial now and follow up.`);
      clearPick();
    } catch (e) {
      setStatus("error");
      setMessage(e instanceof Error ? e.message : "Failed to place the call.");
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.outboundCall.heading")}</h2>
        <p className="mt-0.5 mb-4 text-xs text-slate-500">{t("pages.outboundCall.intro")}</p>

        {/* Purpose picker */}
        <div className="mb-3 flex flex-wrap gap-2">
          {PURPOSES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setPurpose(key);
                setStatus("idle");
                setMessage(null);
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

        {/* Contact picker */}
        <div ref={boxRef} className="relative mb-3">
          <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.outboundCall.callContact")}</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" strokeWidth={2} />
            <input
              className={`${input} pl-9 ${pickedId ? "pr-9" : ""}`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPickedId(null);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={
                loadingContacts
                  ? t("pages.outboundCall.loadingContacts")
                  : contacts.length
                    ? t("pages.outboundCall.searchPlaceholder")
                    : t("pages.outboundCall.noSavedContacts")
              }
              disabled={loadingContacts}
            />
            {pickedId && (
              <button
                type="button"
                onClick={clearPick}
                aria-label={t("pages.outboundCall.clearContact")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </div>

          {open && contacts.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-lg">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">{t("pages.outboundCall.noMatches")}</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    // onMouseDown fires before the input's blur, so the pick registers.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(c);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
                  >
                    <User2 className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} />
                    <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200">{c.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{c.phone}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.outboundCall.leadName")}</span>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("pages.outboundCall.leadNamePlaceholder")} />
          </div>
          <div>
            <span className="mb-1 block text-[11px] font-medium text-slate-500">{t("pages.outboundCall.phone")}</span>
            <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (626) 555-1234" />
          </div>
        </div>

        {needsDetail && (
          <div className="mt-3">
            <span className="mb-1 block text-[11px] font-medium text-slate-500">
              {purpose === "survey" ? t("pages.outboundCall.whatShouldLucyAsk") : t("pages.bulkCall.whatSTheAnnouncement")}
            </span>
            <textarea
              className={`${input} resize-y`}
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

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void placeCall()}
            disabled={!phone.trim() || status === "calling"}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
          >
            <PhoneOutgoing className="h-4 w-4" strokeWidth={2} />
            {status === "calling" ? t("pages.outboundCall.placingCall") : t("pages.outboundCall.aiCall")}
          </button>
          {message && (
            <span className={`text-xs font-medium ${status === "error" ? "text-rose-600" : "text-emerald-600"}`}>
              {message}
            </span>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">{t("pages.outboundCall.creditsNote")}</p>
    </div>
  );
}
