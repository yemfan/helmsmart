"use client";

import { useTranslation } from "react-i18next";

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

type PickContact = { id: string; name: string; phone: string; email: string };

type Channel = "call" | "sms" | "email";
type Purpose = "follow_up" | "survey" | "promo";
type Segment = "hot" | "quiet" | "all";
type TargetMode = "contact" | "segment";

/** Labels resolve from `dashboard:outreach.purpose.*` — module scope has no hook. */
const PURPOSES: { key: Purpose; labelKey: string; icon: typeof Users }[] = [
  { key: "follow_up", labelKey: "followUp", icon: Users },
  { key: "survey", labelKey: "survey", icon: ClipboardList },
  { key: "promo", labelKey: "promo", icon: Megaphone },
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
 * Channels: Call + SMS + Email, send-now. t("outreach.when.later") is surfaced as
 * a disabled seam pending phase 2. Calls reuse
 * /api/dashboard/voice/outbound-call(+/bulk); SMS reuses /api/ai-sms/send(+/bulk);
 * email reuses /api/ai-email/send(+/bulk). The picker is channel-aware (phone
 * for call/SMS, email for email) via /api/dashboard/contacts/reachable.
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
  prefill?: { contactId: string; channel: "call" | "sms" | "email"; nonce: number } | null;
}) {
  const { t } = useTranslation("dashboard");
  const [channel, setChannel] = useState<Channel>("call");
  const [purpose, setPurpose] = useState<Purpose>("follow_up");
  const [targetMode, setTargetMode] = useState<TargetMode>("contact");
  const [segment, setSegment] = useState<Segment>("quiet");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
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
        const res = await fetch("/api/dashboard/contacts/reachable");
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

  // Only contacts reachable on the active channel: phone for call/SMS, email
  // for email.
  const reachable = useMemo(
    () => contacts.filter((c) => (channel === "email" ? c.email : c.phone)),
    [contacts, channel],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const list = !q
      ? reachable
      : reachable.filter((c) => {
          const nameHit = c.name.toLowerCase().includes(q);
          const phoneHit = digits.length > 0 && c.phone.replace(/\D/g, "").includes(digits);
          const emailHit = channel === "email" && c.email.toLowerCase().includes(q);
          return nameHit || phoneHit || emailHit;
        });
    return list.slice(0, 8);
  }, [reachable, query, channel]);

  // Apply a per-lead quick-action prefill: aim at one contact + channel and
  // scroll the composer into view. Waits for the contact list to load so we can
  // resolve the lead's phone; if the lead has none on file, say so plainly.
  useEffect(() => {
    if (!prefill || prefill.nonce === appliedPrefillNonce.current || loadingContacts) return;
    appliedPrefillNonce.current = prefill.nonce;
    setChannel(prefill.channel);
    setTargetMode("contact");
    const c = contacts.find((x) => x.id === prefill.contactId);
    const addr = c ? (prefill.channel === "email" ? c.email : c.phone) : "";
    if (c && addr) {
      setPicked(c);
      setQuery(c.name === t("outreach.unnamed") ? addr : c.name);
      setStatus("idle");
      setFeedback(null);
    } else {
      setPicked(null);
      setQuery("");
      setStatus("error");
      setFeedback(
        prefill.channel === "email"
          ? t("outreach.errors.leadNoEmail")
          : t("outreach.errors.leadNoPhone"),
      );
    }
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [prefill, contacts, loadingContacts]);

  // SMS/email always need a body; a survey/promo call needs the script/announcement.
  // A plain follow-up call lets the assistant improvise, so the message is optional.
  const messageRequired = channel !== "call" || purpose === "survey" || purpose === "promo";
  const subjectRequired = channel === "email";

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
    setQuery(c.name === t("outreach.unnamed") ? c.phone || c.email : c.name);
    setOpen(false);
    resetFeedback();
  }

  function clearPick() {
    setPicked(null);
    setQuery("");
  }

  async function gatherSegmentIds(): Promise<string[]> {
    if (segment === "all") {
      // Reachable contacts already loaded — scoped to the active channel.
      return reachable.slice(0, MAX_BULK).map((c) => c.id);
    }
    const res = await fetch(
      `/api/dashboard/leads?filter=${SEGMENT_FILTER[segment]}&pageSize=${MAX_BULK}`,
    );
    const data = (await res.json().catch(() => ({}))) as { leads?: { id: string }[] };
    return (data.leads ?? []).map((l) => String(l.id)).filter(Boolean).slice(0, MAX_BULK);
  }

  const messageLabel =
    channel === "call"
      ? purpose === "survey"
        ? t("outreach.prompts.survey")
        : purpose === "promo"
          ? t("outreach.prompts.promo")
          : t("outreach.prompts.optional")
      : t("outreach.prompts.yourMessage");

  const messagePlaceholder =
    channel === "call"
      ? purpose === "survey"
        ? 'e.g. t("outreach.placeholders.survey")'
        : purpose === "promo"
          ? 'e.g. "A new listing just hit your target neighborhood — want a private showing?"'
          : "Context for the call (optional) — e.g. they asked about financing last week."
      : purpose === "survey"
        ? "Hi {{name}}, how was your home tour? Mind leaving a quick review?"
        : purpose === "promo"
          ? "A new listing just hit your target neighborhood — want a private showing?"
          : "Hi {{name}}, just checking in — still looking, or is now not the right time?";

  const subjectPlaceholder =
    purpose === "survey"
      ? t("outreach.placeholders.surveySubject")
      : purpose === "promo"
        ? t("outreach.placeholders.promoSubject")
        : t("outreach.placeholders.followUpSubject");

  function describeResult(
    kind: "call" | "sms" | "email",
    r: { sent?: number; placed?: number; failed?: number; total?: number },
  ) {
    const ok = (kind === "call" ? r.placed : r.sent) ?? 0;
    const failed = r.failed ?? 0;
    const verb = kind === "call" ? "calls placed" : kind === "email" ? "emails sent" : "texts sent";
    return failed > 0
      ? `${ok} ${verb}, ${failed} failed of ${r.total ?? ok + failed}.`
      : `${ok} ${verb}.`;
  }

  async function run() {
    if (status === "working") return;
    if (targetMode === "contact" && !picked) {
      setStatus("error");
      setFeedback(t("outreach.errors.pickContact"));
      return;
    }
    if (targetMode === "segment" && segmentCount === 0) {
      setStatus("error");
      setFeedback(t("outreach.errors.segmentEmpty"));
      return;
    }
    if (targetMode === "contact" && picked) {
      const reachableOnChannel = channel === "email" ? picked.email : picked.phone;
      if (!reachableOnChannel) {
        setStatus("error");
        setFeedback(channel === "email" ? t("outreach.errors.noEmail") : t("outreach.errors.noPhone"));
        return;
      }
    }
    if (subjectRequired && !subject.trim()) {
      setStatus("error");
      setFeedback(t("outreach.errors.addSubject"));
      return;
    }
    if (messageRequired && !message.trim()) {
      setStatus("error");
      setFeedback(channel === "call" ? t("outreach.errors.addScript") : t("outreach.errors.addMessage"));
      return;
    }
    let scheduledIso: string | null = null;
    if (scheduleMode) {
      const when = scheduledFor ? new Date(scheduledFor) : null;
      if (!when || Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
        setStatus("error");
        setFeedback("Pick a date & time in the future.");
        return;
      }
      scheduledIso = when.toISOString();
    }

    setStatus("working");
    setFeedback(null);
    try {
      if (scheduleMode && scheduledIso) {
        const contactIds = targetMode === "contact" && picked ? [picked.id] : await gatherSegmentIds();
        if (contactIds.length === 0) throw new Error(t("outreach.errors.noneToSchedule"));
        const res = await fetch("/api/dashboard/outreach/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel,
            purpose,
            contactIds,
            subject: subject.trim() || undefined,
            body: message.trim() || undefined,
            scheduledFor: scheduledIso,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string; count?: number };
        if (!res.ok || !data.ok) throw new Error(data.error || t("outreach.errors.scheduleFailed"));
        const noun = channel === "call" ? "call" : channel === "email" ? "email" : "text";
        const n = data.count ?? contactIds.length;
        const whenLabel = new Date(scheduledIso).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        setStatus("done");
        setFeedback(`Scheduled ${n} ${noun}${n === 1 ? "" : "s"} for ${whenLabel}.`);
        setMessage("");
        setSubject("");
        clearPick();
        setScheduleMode(false);
        setScheduledFor("");
        onComplete?.();
        return;
      }
      if (channel === "call") {
        if (targetMode === "contact" && picked) {
          const res = await fetch("/api/dashboard/voice/outbound-call", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: picked.name === t("outreach.unnamed") ? "" : picked.name,
              phone: picked.phone,
              purpose,
              detail: message.trim() || undefined,
            }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string; to?: string };
          if (!res.ok || !data.ok) throw new Error(data.error || t("outreach.errors.callFailed"));
          setFeedback(`Calling ${data.to}… your assistant will dial now and follow up.`);
        } else {
          const contactIds = await gatherSegmentIds();
          if (contactIds.length === 0) throw new Error(t("outreach.errors.noneInSegment"));
          const res = await fetch("/api/dashboard/voice/outbound-call/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactIds, purpose, detail: message.trim() || undefined }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string; placed?: number; failed?: number; total?: number };
          if (!res.ok || !data.ok) throw new Error(data.error || t("outreach.errors.bulkCallFailed"));
          setFeedback(describeResult("call", data));
        }
      } else if (channel === "sms") {
        if (targetMode === "contact" && picked) {
          const res = await fetch("/api/ai-sms/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: picked.id, to: picked.phone, body: message.trim() }),
          });
          const data = (await res.json()) as { success?: boolean; error?: string };
          if (!res.ok || !data.success) throw new Error(data.error || t("outreach.errors.textFailed"));
          setFeedback(`Text sent to ${picked.phone}.`);
        } else {
          const contactIds = await gatherSegmentIds();
          if (contactIds.length === 0) throw new Error(t("outreach.errors.noneInSegment"));
          const res = await fetch("/api/ai-sms/send/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactIds, body: message.trim() }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string; sent?: number; failed?: number; total?: number };
          if (!res.ok || !data.ok) throw new Error(data.error || t("outreach.errors.bulkSmsFailed"));
          setFeedback(describeResult("sms", data));
        }
      } else {
        // Email
        if (targetMode === "contact" && picked) {
          const res = await fetch("/api/ai-email/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: picked.id, to: picked.email, subject: subject.trim(), body: message.trim() }),
          });
          const data = (await res.json()) as { success?: boolean; error?: string };
          if (!res.ok || !data.success) throw new Error(data.error || t("outreach.errors.emailFailed"));
          setFeedback(`Email sent to ${picked.email}.`);
        } else {
          const contactIds = await gatherSegmentIds();
          if (contactIds.length === 0) throw new Error(t("outreach.errors.noneInSegment"));
          const res = await fetch("/api/ai-email/send/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contactIds, subject: subject.trim(), body: message.trim() }),
          });
          const data = (await res.json()) as { ok?: boolean; error?: string; sent?: number; failed?: number; total?: number };
          if (!res.ok || !data.ok) throw new Error(data.error || t("outreach.errors.bulkEmailFailed"));
          setFeedback(describeResult("email", data));
        }
      }
      setStatus("done");
      setMessage("");
      setSubject("");
      clearPick();
      onComplete?.();
    } catch (e) {
      setStatus("error");
      setFeedback(e instanceof Error ? e.message : t("outreach.errors.generic"));
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";
  const segmentVerb = channel === "call" ? "Call" : channel === "email" ? "Email" : "Text";
  const singleVerb = channel === "call" ? t("outreach.actions.placeCall") : channel === "email" ? t("outreach.actions.sendEmail") : t("outreach.actions.sendText");
  const submitLabel = scheduleMode
    ? targetMode === "segment"
      ? `Schedule ${targetCount}${overCap ? ` of ${segmentCount}` : ""}`
      : t("outreach.actions.schedule")
    : targetMode === "segment"
      ? `${segmentVerb} ${targetCount}${overCap ? ` of ${segmentCount}` : ""}`
      : singleVerb;

  return (
    <section ref={rootRef} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Send className="h-4 w-4 text-blue-600" strokeWidth={2} />
        <h2 className="text-sm font-semibold text-slate-900">{t("outreach.heading")}</h2>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Your Sales Assistant reaches out on your behalf — pick a channel, who to reach, and go.
      </p>

      {/* 1 · Channel */}
      <Step label={t("outreach.steps.channel")} />
      <div className="mb-4 flex gap-2">
        <ChannelTab active={channel === "call"} onClick={() => { setChannel("call"); resetFeedback(); }} icon={PhoneOutgoing} label="Call" />
        <ChannelTab active={channel === "sms"} onClick={() => { setChannel("sms"); resetFeedback(); }} icon={MessageSquare} label="SMS" />
        <ChannelTab active={channel === "email"} onClick={() => { setChannel("email"); resetFeedback(); }} icon={Mail} label="Email" />
      </div>

      {/* 2 · Purpose */}
      <Step label={t("outreach.steps.purpose")} />
      <div className="mb-4 flex flex-wrap gap-2">
        {PURPOSES.map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => { setPurpose(key); resetFeedback(); }}
            className={chip(purpose === key)}
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {t(`outreach.purpose.${labelKey}`)}
          </button>
        ))}
      </div>

      {/* 3 · Who */}
      <Step label={t("outreach.steps.who")} />
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
                  : reachable.length
                    ? channel === "email"
                      ? "Search contacts by name or email…"
                      : "Search contacts by name or number…"
                    : channel === "email"
                      ? t("outreach.noEmailContacts")
                      : t("outreach.noPhoneContacts")
              }
              disabled={loadingContacts}
            />
            {picked && (
              <button
                type="button"
                onClick={clearPick}
                aria-label={t("outreach.clearSelected")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </div>
          {open && reachable.length > 0 && (
            <div className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {filtered.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-400">{t("outreach.noMatching")}</div>
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
                    <span className="shrink-0 truncate text-xs text-slate-500">{channel === "email" ? c.email : c.phone}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2">
          <SegmentChip active={segment === "hot"} onClick={() => { setSegment("hot"); resetFeedback(); }} label={t("outreach.who.hotLeads")} count={segmentCounts.hot} />
          <SegmentChip active={segment === "quiet"} onClick={() => { setSegment("quiet"); resetFeedback(); }} label="Quiet 7d+" count={segmentCounts.quiet} tone="warn" />
          <SegmentChip active={segment === "all"} onClick={() => { setSegment("all"); resetFeedback(); }} label="All" count={segmentCounts.all} />
        </div>
      )}

      {/* 4 · Message */}
      {channel === "email" && (
        <>
          <Step label={t("outreach.steps.subject")} />
          <input
            className={`${input} mb-3`}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={subjectPlaceholder}
          />
        </>
      )}
      <Step label={`${channel === "email" ? "5" : "4"} · ${messageLabel}`} />
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
      {channel !== "sms" && <div className="mb-4" />}

      {/* When + submit */}
      <Step label={`${channel === "email" ? "6" : "5"} · When`} />
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setScheduleMode(false); resetFeedback(); }} className={chip(!scheduleMode)}>
          <Send className="h-3.5 w-3.5" strokeWidth={2} />
          Send now
        </button>
        <button type="button" onClick={() => { setScheduleMode(true); resetFeedback(); }} className={chip(scheduleMode)}>
          <Clock className="h-3.5 w-3.5" strokeWidth={2} />
          Schedule for later
        </button>
        {scheduleMode && (
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => { setScheduledFor(e.target.value); resetFeedback(); }}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => void run()}
          disabled={status === "working" || (targetMode === "segment" && segmentCount === 0)}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
        >
          {scheduleMode ? (
            <Clock className="h-4 w-4" strokeWidth={2} />
          ) : channel === "call" ? (
            <PhoneOutgoing className="h-4 w-4" strokeWidth={2} />
          ) : channel === "email" ? (
            <Mail className="h-4 w-4" strokeWidth={2} />
          ) : (
            <MessageSquare className="h-4 w-4" strokeWidth={2} />
          )}
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
  const { t } = useTranslation("dashboard");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? t("outreach.comingSoon") : undefined}
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
