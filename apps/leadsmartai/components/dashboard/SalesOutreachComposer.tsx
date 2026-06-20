"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  Clock,
  Mail,
  Megaphone,
  MessageSquare,
  PhoneOutgoing,
  Search,
  Send,
  User2,
  Users,
  X,
} from "lucide-react";

type PickContact = { id: string; name: string; phone: string };

type Channel = "call" | "sms" | "email";
type Purpose = "follow_up" | "survey" | "promo";
type Segment = "hot" | "quiet" | "all";
type TargetMode = "contact" | "segment";

const PURPOSES: { key: Purpose; label: string; icon: typeof Users }[] = [
  { key: "follow_up", label: "Follow-up", icon: Users },
  { key: "survey", label: "Survey / review", icon: ClipboardList },
  { key: "promo", label: "Promo / announcement", icon: Megaphone },
];

/** Per-batch cap — mirrors the bulk call/SMS API routes. */
const MAX_BULK = 25;

const SEGMENT_FILTER: Record<Exclude<Segment, "all">, string> = {
  hot: "hot",
  quiet: "inactive",
};

type Status = "idle" | "working" | "done" | "error";

/**
 * Sales Assistant outreach composer — one place to run an outbound action
 * across channels: choose a channel → purpose → who → message → send now.
 *
 * Phase 1 ships Call + SMS, send-now. Email and "schedule for later" are
 * surfaced as disabled seams so phase 2 is purely additive. Calls reuse
 * /api/dashboard/voice/outbound-call(+/bulk); SMS reuses
 * /api/ai-sms/send(+/bulk).
 */
export default function SalesOutreachComposer({
  segmentCounts,
  onComplete,
  prefill,
}: {
  /** Live counts for the segment chips (from the page's summary metrics). */
  segmentCounts: { hot: number; quiet: number; all: number };
  /** Called after a successful send so the page can refresh its KPIs/lists. */
  onComplete?: () => void;
  /**
   * Set by a per-lead quick button to aim the composer at one contact + channel.
   * `nonce` bumps on every click so re-picking the same lead/channel re-applies.
   */
  prefill?: { contactId: string; channel: "call" | "sms"; nonce: number } | null;
}) {
  const [channel, setChannel] = useState<Channel>("call");
  const [purpose, setPurpose] = useState<Purpose>("follow_up");
  const [targetMode, setTargetMode] = useState<TargetMode>("contact");
  const [segment, setSegment] = useState<Segment>("quiet");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [feedback, setFeedback] = useState<string | null>(null);

  // Contact picker
  const [contacts, setContacts] = useState<PickContact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickContact | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const appliedPrefillNonce = useRef(0);

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

  // Apply a per-lead quick-action prefill: aim at one contact + channel and
  // scroll the composer into view. Waits for the contact list to load so we can
  // resolve the lead's phone; if the lead has none on file, say so plainly.
  useEffect(() => {
    if (!prefill || prefill.nonce === appliedPrefillNonce.current || loadingContacts) return;
    appliedPrefillNonce.current = prefill.nonce;
    setChannel(prefill.channel);
    setTargetMode("contact");
    const c = contacts.find((x) => x.id === prefill.contactId);
    if (c) {
      setPicked(c);
      setQuery(c.name === "Unnamed contact" ? c.phone : c.name);
      setStatus("idle");
      setFeedback(null);
    } else {
      setPicked(null);
      setQuery("");
      setStatus("error");
      setFeedback("That lead has no phone number on file — add one to reach them.");
    }
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [prefill, contacts, loadingContacts]);

  // SMS always needs a body; a survey/promo call needs the script/announcement.
  // A plain follow-up call lets the assistant improvise, so the message is optional.
  const messageRequired = channel === "sms" || purpose === "survey" || purpose === "promo";

  const segmentCount =
    segment === "hot" ? segmentCounts.hot : segment === "quiet" ? segmentCounts.quiet : segmentCounts.all;
  const targetCount = targetMode === "contact" ? (picked ? 1 : 0) : Math.min(segmentCount, MAX_BULK);
  const overCap = targetMode === "segment" && segmentCount > MAX_BULK;

  function resetFeedback() {
    setStatus("idle");
    setFeedback(null);
  }

  function pick(c: PickContact) {
    setPicked(c);
    setQuery(c.name === "Unnamed contact" ? c.phone : c.name);
    setOpen(false);
    resetFeedback();
  }

  function clearPick() {
    setPicked(null);
    setQuery("");
  }

  async function gatherSegmentIds(): Promise<string[]> {
    if (segment === "all") {
      // Contacts already loaded for the picker — all have a phone number.
      return contacts.slice(0, MAX_BULK).map((c) => c.id);
    }
    const res = await fetch(
      `/api/dashboard/leads?filter=${SEGMENT_FILTER[segment]}&pageSize=${MAX_BULK}`,
    );
    const data = (await res.json().catch(() => ({}))) as { leads?: { id: string }[] };
    return (data.leads ?? []).map((l) => String(l.id)).filter(Boolean).slice(0, MAX_BULK);
  }

  const messageLabel =
    channel === "sms"
      ? "Your message"
      : purpose === "survey"
        ? "What should your assistant ask?"
        : purpose === "promo"
          ? "What's the announcement?"
          : "Anything to add? (optional)";

  const messagePlaceholder =
    channel === "sms"
      ? purpose === "survey"
        ? "Hi {{name}}, how was your home tour? Mind leaving a quick Google review?"
        : purpose === "promo"
          ? "A new listing just hit your target neighborhood — want a private showing?"
          : "Hi {{name}}, just checking in — still looking, or is now not the right time?"
      : purpose === "survey"
        ? 'e.g. "How was your home tour? Would you leave us a Google review?"'
        : purpose === "promo"
          ? 'e.g. "A new listing just hit your target neighborhood — want a private showing?"'
          : "Context for the call (optional) — e.g. they asked about financing last week.";

  function describeResult(kind: "call" | "sms", r: { sent?: number; placed?: number; failed?: number; total?: number }) {
    const ok = (kind === "call" ? r.placed : r.sent) ?? 0;
    const failed = r.failed ?? 0;
    const verb = kind === "call" ? "calls placed" : "texts sent";
    return failed > 0
      ? `${ok} ${verb}, ${failed} failed of ${r.total ?? ok + failed}.`
      : `${ok} ${verb}.`;
  }

  async function run() {
    if (status === "working") return;
    if (targetMode === "contact" && !picked) {
      setStatus("error");
      setFeedback("Pick a contact, or switch to a segment.");
      return;
    }
    if (targetMode === "segment" && segmentCount === 0) {
      setStatus("error");
      setFeedback("That segment is empty right now.");
      return;
    }
    if (messageRequired && !message.trim()) {
      setStatus("error");
      setFeedback(channel === "sms" ? "Add a message to send." : "Add the script/announcement first.");
      return;
    }

    setStatus("working");
    setFeedback(null);
    try {
      if (channel === "call") {
        if (targetMode === "contact" && picked) {
          const res = await fetch("/api/dashboard/voice/outbound-call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: picked.name === "Unnamed contact" ? "" : picked.name,
              phone: picked.phone,
              purpose,
              detail: message.trim() || undefined,
            }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string; to?: string };
          if (!res.ok || !data.ok) throw new Error(data.error || "Failed to place the call.");
          setFeedback(`Calling ${data.to}… your assistant will dial now and follow up.`);
        } else {
          const contactIds = await gatherSegmentIds();
          if (contactIds.length === 0) throw new Error("No reachable contacts in that segment.");
          const res = await fetch("/api/dashboard/voice/outbound-call/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactIds, purpose, detail: message.trim() || undefined }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string; placed?: number; failed?: number; total?: number };
          if (!res.ok || !data.ok) throw new Error(data.error || "Bulk call failed.");
          setFeedback(describeResult("call", data));
        }
      } else {
        // SMS
        if (targetMode === "contact" && picked) {
          const res = await fetch("/api/ai-sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: picked.id, to: picked.phone, body: message.trim() }),
          });
          const data = (await res.json()) as { success?: boolean; error?: string };
          if (!res.ok || !data.success) throw new Error(data.error || "Failed to send the text.");
          setFeedback(`Text sent to ${picked.phone}.`);
        } else {
          const contactIds = await gatherSegmentIds();
          if (contactIds.length === 0) throw new Error("No reachable contacts in that segment.");
          const res = await fetch("/api/ai-sms/send/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactIds, body: message.trim() }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string; sent?: number; failed?: number; total?: number };
          if (!res.ok || !data.ok) throw new Error(data.error || "Bulk SMS failed.");
          setFeedback(describeResult("sms", data));
        }
      }
      setStatus("done");
      setMessage("");
      clearPick();
      onComplete?.();
    } catch (e) {
      setStatus("error");
      setFeedback(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
  const submitLabel =
    targetMode === "segment"
      ? `${channel === "call" ? "Call" : "Text"} ${targetCount}${overCap ? ` of ${segmentCount}` : ""}`
      : channel === "call"
        ? "Place call"
        : "Send text";

  return (
    <section ref={rootRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Send className="h-4 w-4 text-blue-600" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-slate-900">Run an outreach action</h2>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Your Sales Assistant reaches out on your behalf — pick a channel, who to reach, and go.
      </p>

      {/* 1 · Channel */}
      <Step label="1 · Channel" />
      <div className="mb-4 flex gap-2">
        <ChannelTab active={channel === "call"} onClick={() => { setChannel("call"); resetFeedback(); }} icon={PhoneOutgoing} label="Call" />
        <ChannelTab active={channel === "sms"} onClick={() => { setChannel("sms"); resetFeedback(); }} icon={MessageSquare} label="SMS" />
        <ChannelTab active={false} disabled icon={Mail} label="Email" badge="Soon" />
      </div>

      {/* 2 · Purpose */}
      <Step label="2 · Purpose" />
      <div className="mb-4 flex flex-wrap gap-2">
        {PURPOSES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setPurpose(key); resetFeedback(); }}
            className={chip(purpose === key)}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>

      {/* 3 · Who */}
      <Step label="3 · Who" />
      <div className="mb-2 flex gap-2">
        <button type="button" onClick={() => { setTargetMode("contact"); resetFeedback(); }} className={chip(targetMode === "contact")}>
          One contact
        </button>
        <button type="button" onClick={() => { setTargetMode("segment"); resetFeedback(); }} className={chip(targetMode === "segment")}>
          A segment
        </button>
      </div>

      {targetMode === "contact" ? (
        <div ref={boxRef} className="relative mb-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
            <input
              className={`${input} pl-9 ${picked ? "pr-9" : ""}`}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPicked(null); setOpen(true); }}
              onFocus={() => setOpen(true)}
              placeholder={
                loadingContacts
                  ? "Loading your contacts…"
                  : contacts.length
                    ? "Search contacts by name or number…"
                    : "No saved contacts with a phone number yet"
              }
              disabled={loadingContacts}
            />
            {picked && (
              <button
                type="button"
                onClick={clearPick}
                aria-label="Clear selected contact"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </div>
          {open && contacts.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-400">No matching contacts.</div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50"
                  >
                    <User2 className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} />
                    <span className="min-w-0 flex-1 truncate text-slate-800">{c.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">{c.phone}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          <SegmentChip active={segment === "hot"} onClick={() => { setSegment("hot"); resetFeedback(); }} label="Hot leads" count={segmentCounts.hot} />
          <SegmentChip active={segment === "quiet"} onClick={() => { setSegment("quiet"); resetFeedback(); }} label="Quiet 7d+" count={segmentCounts.quiet} tone="warn" />
          <SegmentChip active={segment === "all"} onClick={() => { setSegment("all"); resetFeedback(); }} label="All" count={segmentCounts.all} />
        </div>
      )}

      {/* 4 · Message */}
      <Step label={`4 · ${messageLabel}`} />
      <textarea
        className={`${input} mb-1 resize-y`}
        rows={2}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={messagePlaceholder}
      />
      {channel === "sms" && (
        <p className="mb-4 text-[11px] text-slate-400">“Reply STOP to unsubscribe” is added automatically.</p>
      )}
      {channel === "call" && <div className="mb-4" />}

      {/* 5 · When + submit */}
      <Step label="5 · When" />
      <div className="flex flex-wrap items-center gap-2">
        <span className={chip(true)}>
          <Send className="h-3.5 w-3.5" strokeWidth={2} />
          Send now
        </span>
        <span className={`${chipBase} cursor-not-allowed border-slate-200 text-slate-400`} title="Coming soon">
          <Clock className="h-3.5 w-3.5" strokeWidth={2} />
          Schedule for later
          <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Soon</span>
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === "working" || (targetMode === "segment" && segmentCount === 0)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
        >
          {channel === "call" ? <PhoneOutgoing className="h-4 w-4" strokeWidth={2} /> : <MessageSquare className="h-4 w-4" strokeWidth={2} />}
          {status === "working" ? "Working…" : submitLabel}
        </button>
      </div>

      {overCap && (
        <p className="mt-2 text-[11px] text-slate-400">
          Batches are capped at {MAX_BULK} — this reaches the first {MAX_BULK} of {segmentCount}.
        </p>
      )}
      {feedback && (
        <p className={`mt-3 text-xs font-medium ${status === "error" ? "text-rose-600" : "text-emerald-600"}`}>
          {feedback}
        </p>
      )}
    </section>
  );
}

const chipBase =
  "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition";

function chip(active: boolean) {
  return `${chipBase} ${
    active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
  }`;
}

function Step({ label }: { label: string }) {
  return <p className="mb-1.5 text-[11px] font-medium text-slate-500">{label}</p>;
}

function ChannelTab({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
  badge,
}: {
  active: boolean;
  onClick?: () => void;
  icon: typeof Mail;
  label: string;
  disabled?: boolean;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? "Coming soon" : undefined}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-blue-500 bg-blue-50 text-blue-700"
          : disabled
            ? "cursor-not-allowed border-slate-200 text-slate-400"
            : "border-slate-200 text-slate-600 hover:bg-slate-50"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
      {label}
      {badge && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{badge}</span>}
    </button>
  );
}

function SegmentChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone?: "warn";
}) {
  return (
    <button type="button" onClick={onClick} className={chip(active)}>
      {label}
      <span
        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
          active ? "bg-blue-100 text-blue-700" : tone === "warn" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
