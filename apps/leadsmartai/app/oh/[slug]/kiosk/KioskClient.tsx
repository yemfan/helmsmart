"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PublicOpenHouseInfo } from "@/lib/open-houses/publicService";

/**
 * iPad-first sign-in kiosk. Three UX properties:
 *
 *  1. Huge tap targets, dark theme, landscape-friendly two-column
 *     layout. Built for a visitor standing at a table, glance-and-tap.
 *
 *  2. Auto-reset after submit. Shows a 4-second "Thanks!" overlay,
 *     then blanks the form and focuses the name field. Agents don't
 *     have to touch the iPad between visitors.
 *
 *  3. Offline tolerance. If `navigator.onLine` is false at submit time,
 *     we stash the payload in localStorage and show it as "pending sync"
 *     in the session counter. An `online` event listener flushes
 *     queued submissions one at a time, best-effort, silently.
 *
 *     Scope note: no service worker in v1 — the iPad tab stays open
 *     during the event, so the shell is already loaded. Service-
 *     worker caching is a follow-up for cold starts while offline.
 */

type Timeline =
  | "now"
  | "3_6_months"
  | "6_12_months"
  | "later"
  | "just_looking";

const TIMELINE_OPTIONS: Array<{ value: Timeline; label: string; emoji: string }> = [
  { value: "now", label: "Actively looking", emoji: "🔥" },
  { value: "3_6_months", label: "3–6 months", emoji: "📅" },
  { value: "6_12_months", label: "6–12 months", emoji: "🗓️" },
  { value: "later", label: "Just exploring", emoji: "👀" },
  { value: "just_looking", label: "Just curious", emoji: "🏠" },
];

type SubmitPayload = {
  name: string | null;
  email: string | null;
  phone: string | null;
  isBuyerAgented: boolean;
  buyerAgentName: string | null;
  buyerAgentBrokerage: string | null;
  timeline: Timeline | null;
  marketingConsent: boolean;
};

const QUEUE_KEY = (slug: string) => `oh-kiosk-queue:${slug}`;
const SESSION_KEY = (slug: string) => `oh-kiosk-session:${slug}`;
const RESET_MS = 4000;

export function KioskClient({ info }: { info: PublicOpenHouseInfo }) {
  const { t } = useTranslation("dashboard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isBuyerAgented, setBuyerAgented] = useState(false);
  const [buyerAgentName, setBuyerAgentName] = useState("");
  const [buyerAgentBrokerage, setBuyerAgentBrokerage] = useState("");
  const [timeline, setTimeline] = useState<Timeline | null>(null);
  const [marketingConsent, setMarketingConsent] = useState(true); // opt-in by default on kiosk
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);

  // Live online-status indicator — sets pending-queue badge accurately.
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Initial read of queue depth + session counter on mount.
  useEffect(() => {
    setPendingCount(readQueue(info.slug).length);
    setSessionCount(Number(localStorage.getItem(SESSION_KEY(info.slug)) ?? "0") || 0);
  }, [info.slug]);

  // Flush any queued submits on reconnect.
  useEffect(() => {
    if (!online) return;
    void flushQueue(info.slug, (left) => setPendingCount(left));
  }, [online, info.slug]);

  const resetForm = useCallback(() => {
    setName("");
    setEmail("");
    setPhone("");
    setBuyerAgented(false);
    setBuyerAgentName("");
    setBuyerAgentBrokerage("");
    setTimeline(null);
    setMarketingConsent(true);
    setError(null);
    setConfirmation(null);
    // Focus name for the next visitor; small delay to let the overlay fade.
    setTimeout(() => nameRef.current?.focus(), 50);
  }, []);

  async function submit() {
    setError(null);
    const payload: SubmitPayload = {
      name: name.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      isBuyerAgented,
      buyerAgentName: isBuyerAgented ? buyerAgentName.trim() || null : null,
      buyerAgentBrokerage: isBuyerAgented ? buyerAgentBrokerage.trim() || null : null,
      timeline,
      marketingConsent: isBuyerAgented ? false : marketingConsent,
    };
    if (!payload.name && !payload.email && !payload.phone) {
      setError("Please enter a name, email, or phone.");
      return;
    }
    setSubmitting(true);
    try {
      // Offline: queue locally. Background effect will flush when we reconnect.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        enqueue(info.slug, payload);
        setPendingCount((c) => c + 1);
        bumpSession(info.slug, setSessionCount);
        setConfirmation("Saved — will sync when online");
        scheduleReset(resetForm);
        return;
      }
      const res = await fetch(`/api/public/open-house/${info.slug}/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        // Fallback: stash and try later. Don't make the visitor retry.
        enqueue(info.slug, payload);
        setPendingCount((c) => c + 1);
        setConfirmation("Saved — will retry");
        bumpSession(info.slug, setSessionCount);
        scheduleReset(resetForm);
        return;
      }
      setConfirmation("Thanks!");
      bumpSession(info.slug, setSessionCount);
      scheduleReset(resetForm);
    } catch {
      enqueue(info.slug, payload);
      setPendingCount((c) => c + 1);
      setConfirmation("Saved — will retry");
      bumpSession(info.slug, setSessionCount);
      scheduleReset(resetForm);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-900 text-white">
      {/* Top strip: property + session counters */}
      <header className="flex items-start justify-between gap-4 px-8 pt-6 pb-3">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Welcome to the open house
          </div>
          <h1 className="mt-1 text-2xl font-semibold leading-tight">
            {info.propertyAddress}
          </h1>
          {info.city || info.state ? (
            <div className="text-sm text-slate-400">
              {[info.city, info.state].filter(Boolean).join(", ")}
              {info.listPrice
                ? ` · ${new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                    maximumFractionDigits: 0,
                  }).format(info.listPrice)}`
                : ""}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2 py-1 font-medium ${
              online
                ? "bg-green-900/60 text-green-200"
                : "bg-amber-900/70 text-amber-200"
            }`}
          >
            {online ? "● Online" : "○ Offline"}
          </span>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-slate-700 px-2 py-1 text-slate-200">
              {pendingCount} pending sync
            </span>
          ) : null}
          <span className="rounded-full bg-slate-700 px-2 py-1 text-slate-200">
            {sessionCount} signed in today
          </span>
        </div>
      </header>

      <main className="px-8 pb-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* LEFT: contact */}
          <section className="space-y-4">
            <KioskInput
              refEl={nameRef}
              label="Your name"
              value={name}
              onChange={setName}
              autoComplete="name"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-4">
              <KioskInput
                label={t("pages.articleChrome.email")}
                value={email}
                onChange={setEmail}
                type="email"
                autoComplete="email"
                inputMode="email"
              />
              <KioskInput
                label={t("pages.articleChrome.phone")}
                value={phone}
                onChange={setPhone}
                type="tel"
                autoComplete="tel"
                inputMode="tel"
              />
            </div>

            <div>
              <div className="mb-2 text-sm font-medium text-slate-300">
                Working with an agent?
              </div>
              <div className="grid grid-cols-2 gap-3">
                <BigToggle
                  selected={!isBuyerAgented}
                  onClick={() => setBuyerAgented(false)}
                  label="No"
                />
                <BigToggle
                  selected={isBuyerAgented}
                  onClick={() => setBuyerAgented(true)}
                  label="Yes"
                />
              </div>
              {isBuyerAgented ? (
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-slate-800 p-4">
                  <KioskInput
                    label="Agent name"
                    value={buyerAgentName}
                    onChange={setBuyerAgentName}
                    compact
                  />
                  <KioskInput
                    label="Brokerage"
                    value={buyerAgentBrokerage}
                    onChange={setBuyerAgentBrokerage}
                    compact
                  />
                </div>
              ) : null}
            </div>
          </section>

          {/* RIGHT: timeline + consent + submit */}
          <section className="space-y-4">
            <div>
              <div className="mb-2 text-sm font-medium text-slate-300">
                When are you looking to buy?
              </div>
              <div className="grid grid-cols-2 gap-3">
                {TIMELINE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTimeline(opt.value)}
                    className={`rounded-2xl border-2 px-4 py-4 text-left text-base font-medium transition-colors ${
                      timeline === opt.value
                        ? "border-emerald-400 bg-emerald-500/20 text-white"
                        : "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                    }`}
                  >
                    <span className="mr-2 text-xl">{opt.emoji}</span>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {!isBuyerAgented ? (
              <label className="flex items-start gap-3 rounded-xl bg-slate-800 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={marketingConsent}
                  onChange={(e) => setMarketingConsent(e.target.checked)}
                  className="mt-1 h-5 w-5 rounded border-slate-500 bg-slate-900"
                />
                <span className="text-slate-200">
                  Send me similar listings and follow-up info.
                  <span className="mt-1 block text-xs text-slate-400">
                    You can reply STOP anytime.
                  </span>
                </span>
              </label>
            ) : null}

            {error ? (
              <div className="rounded-lg bg-red-900/40 px-4 py-3 text-sm text-red-200">
                {error}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="w-full rounded-2xl bg-emerald-500 py-6 text-xl font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Sign in"}
            </button>
          </section>
        </div>
      </main>

      {/* Confirmation overlay — dismisses itself on reset. */}
      {confirmation ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm">
          <div className="rounded-3xl bg-emerald-500 px-12 py-10 text-center shadow-2xl">
            <div className="text-7xl">✅</div>
            <div className="mt-3 text-3xl font-semibold text-slate-950">
              {confirmation}
            </div>
            <div className="mt-2 text-sm text-slate-900/80">
              Form resets in a moment…
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KioskInput({
  refEl,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
  autoFocus,
  inputMode,
  compact,
}: {
  refEl?: React.RefObject<HTMLInputElement | null>;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  inputMode?: "text" | "email" | "tel" | "numeric";
  compact?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-300">{label}</span>
      <input
        ref={refEl}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        inputMode={inputMode}
        className={`w-full rounded-xl border-2 border-slate-700 bg-slate-800 text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none ${
          compact ? "px-4 py-3 text-base" : "px-5 py-4 text-lg"
        }`}
      />
    </label>
  );
}

function BigToggle({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border-2 py-4 text-base font-semibold transition-colors ${
        selected
          ? "border-emerald-400 bg-emerald-500/20 text-white"
          : "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
      }`}
    >
      {label}
    </button>
  );
}

// ── Offline queue (localStorage) ──────────────────────────────────────

type QueuedItem = SubmitPayload & { enqueuedAt: string };

function readQueue(slug: string): QueuedItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY(slug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueuedItem[]) : [];
  } catch {
    return [];
  }
}

function writeQueue(slug: string, items: QueuedItem[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(QUEUE_KEY(slug), JSON.stringify(items));
  } catch {
    // Quota exceeded — nothing sensible to do at a kiosk.
  }
}

function enqueue(slug: string, payload: SubmitPayload): void {
  const items = readQueue(slug);
  items.push({ ...payload, enqueuedAt: new Date().toISOString() });
  writeQueue(slug, items);
}

async function flushQueue(
  slug: string,
  onProgress: (remaining: number) => void,
): Promise<void> {
  let items = readQueue(slug);
  if (!items.length) return;
  while (items.length) {
    const next = items[0];
    try {
      const res = await fetch(`/api/public/open-house/${slug}/signin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(stripMeta(next)),
      });
      if (!res.ok) break; // stop flushing, try again later
    } catch {
      break;
    }
    items = items.slice(1);
    writeQueue(slug, items);
    onProgress(items.length);
  }
}

function stripMeta(item: QueuedItem): SubmitPayload {
  const { enqueuedAt: _enqueuedAt, ...rest } = item;
  void _enqueuedAt;
  return rest;
}

function bumpSession(slug: string, setCount: (updater: (n: number) => number) => void) {
  try {
    const next = (Number(localStorage.getItem(SESSION_KEY(slug)) ?? "0") || 0) + 1;
    localStorage.setItem(SESSION_KEY(slug), String(next));
    setCount(() => next);
  } catch {
    setCount((c) => c + 1);
  }
}

let _resetTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReset(reset: () => void) {
  if (_resetTimer) clearTimeout(_resetTimer);
  _resetTimer = setTimeout(reset, RESET_MS);
}
