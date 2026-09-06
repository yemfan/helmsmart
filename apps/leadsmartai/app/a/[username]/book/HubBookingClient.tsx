"use client";

import { useEffect, useState } from "react";
import { CalendarCheck, Check, ExternalLink } from "lucide-react";
import { trackHubEvent } from "../hubEvents";
import { BTN, type HubTheme } from "../theme";

/**
 * Booking, in whichever of three shapes the agent's account supports:
 *
 *   receptionist  real slots from the AI receptionist's calendar engine —
 *                 pick a day, pick a time, leave details, it is booked;
 *   external      the agent's own scheduler (Calendly, Cal.com…) — one
 *                 clear button out, nothing pretended;
 *   request       no calendar — the visitor asks, the agent gets a hot lead
 *                 and a task, and calls back.
 *
 * The mode is resolved server-side from real settings; this component only
 * renders what it is told.
 */

type Slot = { startISO: string; label: string };

type Labels = {
  pickDate: string;
  pickTime: string;
  closed: string;
  noSlots: string;
  loadingSlots: string;
  yourDetails: string;
  meetingMode: string;
  modes: { phone: string; video: string; in_person: string };
  notes: string;
  confirm: string;
  confirming: string;
  doneTitle: string;
  doneBody: string;
  requestTitle: string;
  requestBody: string;
  externalTitle: string;
  externalBody: string;
  externalCta: string;
  failed: string;
  slotTaken: string;
  duration: string;
  name: string;
  email: string;
  phone: string;
  consent: string;
  errorName: string;
  errorContact: string;
  submit: string;
  submitting: string;
};

function localDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function HubBookingClient({
  username,
  mode,
  externalUrl,
  labels,
  theme,
  locale,
}: {
  username: string;
  mode: "receptionist" | "external" | "request";
  externalUrl: string | null;
  labels: Labels;
  theme: HubTheme;
  locale: string;
}) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [date, setDate] = useState(localDate(tomorrow));
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [closed, setClosed] = useState(false);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ label: string | null } | null>(null);

  useEffect(() => {
    trackHubEvent(username, "appointment_started", { label: mode });
  }, [username, mode]);

  useEffect(() => {
    if (mode !== "receptionist") return;
    let cancelled = false;
    setLoadingSlots(true);
    setSlot(null);
    setSlots(null);
    fetch(`/api/public/hub/${encodeURIComponent(username)}/booking?date=${encodeURIComponent(date)}`, {
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; closed?: boolean; slots?: Slot[] }) => {
        if (cancelled) return;
        if (!j?.ok) {
          setSlots([]);
          return;
        }
        setClosed(Boolean(j.closed));
        setSlots(Array.isArray(j.slots) ? j.slots : []);
      })
      .catch(() => !cancelled && setSlots([]))
      .finally(() => !cancelled && setLoadingSlots(false));
    return () => {
      cancelled = true;
    };
  }, [username, date, mode]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const phone = String(form.get("phone") ?? "").trim();
    if (!name) return setError(labels.errorName);
    if (!email && !phone) return setError(labels.errorContact);
    if (mode === "receptionist" && !slot) return;
    setError(null);
    setBusy(true);
    try {
      const common = {
        name,
        email,
        phone,
        intent: "consult",
        message: String(form.get("notes") ?? "").trim(),
        smsConsent: form.get("consent") === "on",
        locale,
      };
      if (mode === "receptionist" && slot) {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(username)}/booking`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ...common, startISO: slot.startISO, meetingMode: String(form.get("meetingMode") ?? "") }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; label?: string | null };
        if (!res.ok || !json.ok) {
          setError(json.error === "slot_taken" ? labels.slotTaken : labels.failed);
          if (json.error === "slot_taken") setDate((d) => d); // caller re-picks; slots refetch on change
          return;
        }
        setDone({ label: json.label ?? slot.label });
      } else {
        const res = await fetch(`/api/public/hub/${encodeURIComponent(username)}/lead`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ ...common, channel: "booking" }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setDone({ label: null });
      }
    } catch {
      setError(labels.failed);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-base text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 sm:py-2.5 sm:text-sm";
  const label = "block text-sm font-medium text-slate-700";

  if (mode === "external" && externalUrl) {
    return (
      <div className="rounded-2xl bg-white p-6 text-center shadow-[var(--shadow-raised)] ring-1 ring-slate-200 sm:p-10">
        <h2 className="text-xl font-semibold text-slate-900">{labels.externalTitle}</h2>
        <p className="mx-auto mt-2 max-w-md text-slate-600">{labels.externalBody}</p>
        <a
          href={externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackHubEvent(username, "appointment_started", { label: "external_click" })}
          className={`${BTN} mt-6 ${theme.primary} ${theme.ring}`}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          {labels.externalCta}
        </a>
      </div>
    );
  }

  if (done) {
    return (
      <div role="status" className="rounded-2xl bg-white p-6 text-center shadow-[var(--shadow-raised)] ring-1 ring-slate-200 sm:p-10">
        <span className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${theme.tint}`}>
          <Check className="h-6 w-6" aria-hidden />
        </span>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">{mode === "receptionist" ? labels.doneTitle : labels.requestTitle}</h2>
        {done.label ? <p className="mt-2 text-lg font-medium text-slate-800">{done.label}</p> : null}
        <p className="mx-auto mt-2 max-w-md text-slate-600">{mode === "receptionist" ? labels.doneBody : labels.requestBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-6 rounded-2xl bg-white p-6 shadow-[var(--shadow-raised)] ring-1 ring-slate-200 sm:p-8" noValidate>
      {mode === "receptionist" ? (
        <div className="grid gap-4 sm:grid-cols-[14rem_minmax(0,1fr)]">
          <label className={label}>
            {labels.pickDate}
            <input type="date" value={date} min={localDate(new Date())} onChange={(e) => setDate(e.target.value)} className={field} />
            <span className="mt-1 block text-xs text-slate-500">{labels.duration}</span>
          </label>
          <fieldset>
            <legend className={label}>{labels.pickTime}</legend>
            <div className="mt-1 min-h-[3rem]">
              {loadingSlots ? (
                <p className="text-sm text-slate-500" role="status">
                  {labels.loadingSlots}
                </p>
              ) : closed ? (
                <p className="text-sm text-slate-600">{labels.closed}</p>
              ) : slots && slots.length ? (
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={labels.pickTime}>
                  {slots.map((s) => {
                    const on = slot?.startISO === s.startISO;
                    return (
                      <button
                        key={s.startISO}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setSlot(s)}
                        className={`min-h-11 rounded-lg px-3 py-2 text-sm font-medium ring-1 ring-inset transition focus:outline-none focus-visible:ring-2 ${
                          on ? `${theme.primary} ring-transparent` : "bg-white text-slate-800 ring-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-600">{labels.noSlots}</p>
              )}
            </div>
          </fieldset>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{labels.requestTitle}</h2>
          <p className="mt-1 text-sm text-slate-600">{labels.requestBody}</p>
        </div>
      )}

      <div className="grid gap-4">
        <p className="text-sm font-semibold text-slate-900">{labels.yourDetails}</p>
        <label className={label}>
          {labels.name}
          <input name="name" className={field} autoComplete="name" required />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={label}>
            {labels.email}
            <input name="email" type="email" inputMode="email" className={field} autoComplete="email" />
          </label>
          <label className={label}>
            {labels.phone}
            <input name="phone" type="tel" inputMode="tel" className={field} autoComplete="tel" />
          </label>
        </div>
        {mode === "receptionist" ? (
          <label className={label}>
            {labels.meetingMode}
            <select name="meetingMode" className={field} defaultValue="phone">
              <option value="phone">{labels.modes.phone}</option>
              <option value="video">{labels.modes.video}</option>
              <option value="in person">{labels.modes.in_person}</option>
            </select>
          </label>
        ) : null}
        <label className={label}>
          {labels.notes}
          <textarea name="notes" rows={3} className={field} />
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-600">
          <input type="checkbox" name="consent" className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300" />
          <span>{labels.consent}</span>
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || (mode === "receptionist" && !slot)}
        className={`${BTN} ${theme.primary} ${theme.ring} w-full disabled:opacity-60 sm:w-auto sm:justify-self-start`}
      >
        <CalendarCheck className="h-4 w-4" aria-hidden />
        {busy ? (mode === "receptionist" ? labels.confirming : labels.submitting) : mode === "receptionist" ? labels.confirm : labels.submit}
      </button>
    </form>
  );
}
