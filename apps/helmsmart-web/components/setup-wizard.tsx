"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, PhoneCall, Sparkles, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { CopyField } from "@/components/receptionist-setup";
import { ReceptionistNumberSetup } from "@/components/receptionist-number-setup";
import { Toggle } from "@/components/ui/toggle";
import { ACTIVATION_STEP_IDS, type ActivationState, type ActivationStepId } from "@/lib/activation";
import { draftReceptionistSetup, noteSetupProgress, pollFirstCall, saveBusinessBasics } from "@/lib/actions/setup";
import { saveBusinessHours, upsertAppointmentType } from "@/lib/actions/receptionist";
import { upsertKnowledgeEntry } from "@/lib/actions/receptionist";
import { saveVoiceSettings } from "@/lib/actions/social";
import { DAY_KEYS, type AppointmentType, type BusinessHours, type DayKey } from "@/lib/receptionist";
// `import type` — erased at build time. The draft module reaches the Anthropic
// SDK and `node:dns` through the site reader, and neither belongs in a browser
// bundle; `isStockGreeting` lives in its own import-free module for that reason.
import type { ReceptionistDraft } from "@/lib/receptionist-draft";
import { isStockGreeting } from "@/lib/receptionist-greeting";

/**
 * The guided setup: sign-up to a call Emma answered.
 *
 * WHAT IT WRITES. Nothing of its own. Step 1 goes through `saveBusinessBasics`
 * (which is `updateOrg`, row-checked); steps 2–4 call `saveVoiceSettings`,
 * `upsertKnowledgeEntry`, `saveBusinessHours`, `upsertAppointmentType` and
 * `saveTwilioNumber` — the exact actions Settings → Voice AI calls. So a value
 * set here shows up there and vice versa, and there is one definition of every
 * field rather than two that drift.
 *
 * WHERE THE OWNER IS UP TO is `props.state`, computed on the server from the
 * rows themselves. Nothing here records "done"; a step is done when its data
 * exists. Skipping is therefore free, and so is coming back tomorrow.
 */

type OrgSnapshot = {
  name: string;
  website: string;
  category: string;
  location: string;
  description: string;
  twilioNumber: string | null;
  voiceAgentEnabled: boolean;
  agentName: string;
  businessName: string;
  greeting: string;
  prompt: string;
  hours: BusinessHours;
  hoursSet: boolean;
  /**
   * Passed straight back to `saveVoiceSettings` unchanged. That action writes
   * `booking_alert_phone` from whatever it is handed, so omitting it here
   * would clear an alert number the owner set in Settings — a step quietly
   * undoing a setting it never showed.
   */
  bookingAlertPhone: string;
};

type Props = {
  initialStep: ActivationStepId;
  state: ActivationState;
  org: OrgSnapshot;
  appointmentTypes: AppointmentType[];
  /** Owner/admin. The server action enforces it too — this only avoids offering it. */
  canManageNumber: boolean;
  inboundUrl: string;
  functionUrl: string;
};

const PRIMARY =
  "inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60";
const GHOST = "text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline";
const FIELD =
  "w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function SetupWizard(props: Props) {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const [step, setStep] = useState<ActivationStepId>(props.initialStep);
  const [done, setDone] = useState<Record<ActivationStepId, boolean>>(() =>
    Object.fromEntries(props.state.steps.map((s) => [s.id, s.done])) as Record<ActivationStepId, boolean>,
  );

  const index = ACTIVATION_STEP_IDS.indexOf(step);

  /** Mark a step finished locally and move on, without a round trip. */
  function advance(from: ActivationStepId, completed: boolean) {
    const next = { ...done, [from]: completed || done[from] };
    setDone(next);
    const after = ACTIVATION_STEP_IDS.slice(ACTIVATION_STEP_IDS.indexOf(from) + 1).find((id) => !next[id]);
    if (after) {
      setStep(after);
      window.history.replaceState(null, "", `/setup?step=${after}`);
    } else {
      router.push("/home");
    }
  }

  function go(to: ActivationStepId) {
    setStep(to);
    window.history.replaceState(null, "", `/setup?step=${to}`);
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-8">
      <h1 className="text-2xl font-semibold text-slate-900">{t("setup.title")}</h1>
      <p className="mt-1 text-sm text-slate-500">{t("setup.subtitle")}</p>

      {/* The rail. Status as text with a tick, not a coloured slab. */}
      <ol className="mt-6 flex flex-wrap gap-x-4 gap-y-2 border-b border-slate-200 pb-4">
        {ACTIVATION_STEP_IDS.map((id, i) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => go(id)}
              aria-current={id === step ? "step" : undefined}
              className={`flex items-center gap-1.5 text-xs ${
                id === step ? "font-semibold text-slate-900" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              {done[id] ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-slate-300" />
              )}
              <span>{t(`setup.steps.${id}`)}</span>
              {i < ACTIVATION_STEP_IDS.length - 1 && <span className="ml-2 text-slate-300">·</span>}
            </button>
          </li>
        ))}
      </ol>

      <p className="mt-4 text-xs text-slate-400">
        {t("setup.progress", { current: index + 1, total: ACTIVATION_STEP_IDS.length })}
      </p>

      <div className="mt-4">
        {step === "basics" && <BasicsStep org={props.org} onDone={(ok) => advance("basics", ok)} />}
        {step === "script" && (
          <ScriptStep org={props.org} onDone={(ok) => advance("script", ok)} />
        )}
        {step === "hours" && (
          <HoursStep
            hours={props.org.hours}
            existingTypes={props.appointmentTypes}
            onDone={(ok) => advance("hours", ok)}
          />
        )}
        {step === "number" && (
          <NumberStep
            current={props.org.twilioNumber}
            canManage={props.canManageNumber}
            inboundUrl={props.inboundUrl}
            functionUrl={props.functionUrl}
            onDone={(ok) => advance("number", ok)}
          />
        )}
        {step === "call" && (
          // The rail ticks the moment the call lands. It used to stay hollow
          // beside a step announcing the call had arrived — the UI holding a
          // state the database had already moved past.
          <CallStep number={props.org.twilioNumber} onArrived={() => setDone((d) => ({ ...d, call: true }))} />
        )}
      </div>
    </div>
  );
}

// ─── Step 1: the business ───────────────────────────────────────────────────

function BasicsStep({ org, onDone }: { org: OrgSnapshot; onDone: (ok: boolean) => void }) {
  const { t } = useTranslation("auth");
  const [website, setWebsite] = useState(org.website);
  const [category, setCategory] = useState(org.category);
  const [location, setLocation] = useState(org.location);
  const [description, setDescription] = useState(org.description);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await saveBusinessBasics({ website, category, location, description });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(Boolean(description.trim() || category.trim()));
    });
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">{t("setup.basics.title")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("setup.basics.subtitle", { name: org.name })}</p>

      <div className="mt-5 space-y-4">
        <Field label={t("setup.basics.website.label")} hint={t("setup.basics.website.hint")}>
          <input
            type="url"
            inputMode="url"
            value={website}
            maxLength={200}
            onChange={(e) => setWebsite(e.target.value)}
            className={FIELD}
            placeholder="https://acme.com"
          />
        </Field>
        <Field label={t("setup.basics.category.label")}>
          <input
            type="text"
            value={category}
            maxLength={80}
            onChange={(e) => setCategory(e.target.value)}
            className={FIELD}
            placeholder={t("setup.basics.category.placeholder")}
          />
        </Field>
        <Field label={t("setup.basics.location.label")}>
          <input
            type="text"
            value={location}
            maxLength={120}
            onChange={(e) => setLocation(e.target.value)}
            className={FIELD}
            placeholder={t("setup.basics.location.placeholder")}
          />
        </Field>
        <Field label={t("setup.basics.description.label")} hint={t("setup.basics.description.hint")}>
          <textarea
            rows={3}
            value={description}
            maxLength={600}
            onChange={(e) => setDescription(e.target.value)}
            className={`${FIELD} resize-none`}
            placeholder={t("setup.basics.description.placeholder")}
          />
        </Field>
      </div>

      <Actions pending={pending} onSave={save} onSkip={() => onDone(false)} error={error} />
    </section>
  );
}

// ─── Step 2: what Emma will say ─────────────────────────────────────────────

function ScriptStep({ org, onDone }: { org: OrgSnapshot; onDone: (ok: boolean) => void }) {
  const { t } = useTranslation("auth");
  const [enabled, setEnabled] = useState(org.voiceAgentEnabled || !org.prompt.trim());
  // The stock greeting counts as nothing, so the draft may replace it — see
  // `isStockGreeting`. Without this the step showed a sentence naming no
  // business at all, on the one screen whose promise is the opposite.
  const [greeting, setGreeting] = useState(isStockGreeting(org.greeting) ? "" : org.greeting);
  const [prompt, setPrompt] = useState(org.prompt);
  const [faqs, setFaqs] = useState<{ title: string; content: string }[]>([]);
  const [draft, setDraft] = useState<ReceptionistDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const asked = useRef(false);

  /**
   * Draft on arrival when there is nothing here yet. An owner who has already
   * written a briefing is not shown it being overwritten — they press the
   * button if they want one.
   */
  useEffect(() => {
    if (asked.current) return;
    if (org.prompt.trim() && !isStockGreeting(org.greeting)) return;
    asked.current = true;
    void runDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runDraft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await draftReceptionistSetup();
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setDraft(res.draft);
      setGreeting((g) => (g.trim() ? g : res.draft.greeting));
      setPrompt((p) => (p.trim() ? p : res.draft.context));
      setFaqs(res.draft.faqs);
    } catch (e) {
      console.error("[setup] draft failed", e);
      setError(t("setup.errors.draftFailed"));
    } finally {
      setDrafting(false);
    }
  }

  function save() {
    setError(null);
    start(async () => {
      try {
        await saveVoiceSettings({
          enabled,
          // Emma is the receptionist this product ships; the owner renames her
          // in Settings if they want to. Never blank — a nameless agent
          // introduces itself as nothing.
          agentName: org.agentName.trim() || "Emma",
          businessName: org.businessName.trim() || org.name,
          greeting,
          prompt,
          bookingAlertPhone: org.bookingAlertPhone,
        });
      } catch (e) {
        console.error("[setup] save voice settings", e);
        setError(t("setup.errors.saveFailed"));
        return;
      }
      // Each FAQ is its own knowledge entry, through the action the Settings
      // knowledge card uses. A refused one says so and the others still land.
      for (const f of faqs) {
        if (!f.title.trim() || !f.content.trim()) continue;
        const res = await upsertKnowledgeEntry({ title: f.title, content: f.content });
        if (res.error) {
          setError(res.error);
          return;
        }
      }
      await noteSetupProgress();
      onDone(Boolean(greeting.trim() && prompt.trim()));
    });
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">{t("setup.script.title")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("setup.script.subtitle")}</p>

      {drafting && (
        <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
          {t("setup.script.drafting")}
        </p>
      )}

      {/* Where the words came from — said plainly, because it changes how much
          the owner should trust them. */}
      {!drafting && draft && (
        <p className="mt-4 text-sm text-slate-600">
          {draft.source === "website" && draft.siteUrl
            ? t("setup.script.source.website", { url: draft.siteUrl })
            : draft.source === "description"
              ? t("setup.script.source.description")
              : t("setup.script.source.defaults")}
          {draft.siteFailure ? ` ${t(`setup.script.siteFailure.${draft.siteFailure}`)}` : ""}
        </p>
      )}

      <div className="mt-5 space-y-5">
        <div className="flex items-center gap-2.5">
          <Toggle checked={enabled} onChange={setEnabled} label={t("setup.script.enabled.label")} />
          <span className="text-sm text-slate-700">{t("setup.script.enabled.label")}</span>
        </div>
        <p className="-mt-3 text-xs text-slate-400">{t("setup.script.enabled.help")}</p>

        <Field label={t("setup.script.greeting.label")} hint={t("setup.script.greeting.help")}>
          <input type="text" value={greeting} onChange={(e) => setGreeting(e.target.value)} className={FIELD} />
        </Field>

        <Field label={t("setup.script.context.label")} hint={t("setup.script.context.help")}>
          <textarea
            rows={10}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className={`${FIELD} resize-none font-mono`}
          />
        </Field>

        <div>
          <p className="text-xs font-medium text-slate-500">{t("setup.script.faqs.title")}</p>
          <p className="mt-1 text-xs text-slate-400">{t("setup.script.faqs.hint")}</p>
          {faqs.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{t("setup.script.faqs.empty")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {faqs.map((f, i) => (
                <li key={i} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start gap-2">
                    <input
                      value={f.title}
                      onChange={(e) =>
                        setFaqs((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                      }
                      className="flex-1 border-0 border-b border-transparent p-0 text-sm font-medium text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-0"
                    />
                    <button
                      type="button"
                      onClick={() => setFaqs((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={t("setup.script.faqs.remove")}
                      className="text-slate-300 hover:text-rose-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={f.content}
                    onChange={(e) =>
                      setFaqs((prev) => prev.map((x, j) => (j === i ? { ...x, content: e.target.value } : x)))
                    }
                    className="mt-1.5 w-full resize-none border-0 p-0 text-sm text-slate-600 focus:outline-none focus:ring-0"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <button type="button" onClick={runDraft} disabled={drafting} className={`${GHOST} flex items-center gap-1.5`}>
          <Sparkles className="h-3.5 w-3.5" />
          {t("setup.script.redraft")}
        </button>
      </div>

      <Actions pending={pending} onSave={save} onSkip={() => onDone(false)} error={error} />
    </section>
  );
}

// ─── Step 3: hours and what people book ─────────────────────────────────────

function HoursStep({
  hours: initialHours,
  existingTypes,
  onDone,
}: {
  hours: BusinessHours;
  existingTypes: AppointmentType[];
  onDone: (ok: boolean) => void;
}) {
  const { t } = useTranslation("auth");
  const [hours, setHours] = useState<BusinessHours>(initialHours);
  const [types, setTypes] = useState<{ name: string; durationMinutes: number; existingId?: string }[]>(() =>
    existingTypes.length > 0
      ? existingTypes.map((x) => ({ name: x.name, durationMinutes: x.duration_minutes, existingId: x.id }))
      : [{ name: "", durationMinutes: 30 }],
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function setDay(day: DayKey, next: BusinessHours[DayKey]) {
    setHours((prev) => ({ ...prev, [day]: next }));
  }

  function save() {
    setError(null);
    start(async () => {
      const saved = await saveBusinessHours(hours);
      if (saved.error) {
        setError(saved.error);
        return;
      }
      // Only the ones the owner actually filled in, and only the new ones —
      // re-saving an existing type here would overwrite a description they set
      // in Settings with a blank.
      let created = existingTypes.length;
      for (const type of types) {
        if (type.existingId || !type.name.trim()) continue;
        const res = await upsertAppointmentType({ name: type.name, durationMinutes: type.durationMinutes });
        if (res.error) {
          setError(res.error);
          return;
        }
        created += 1;
      }
      await noteSetupProgress();
      onDone(Object.values(hours).some(Boolean) && created > 0);
    });
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">{t("setup.hours.title")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("setup.hours.subtitle")}</p>

      <div className="mt-5 space-y-2">
        {DAY_KEYS.map((day) => {
          const h = hours[day];
          return (
            <div key={day} className="flex flex-wrap items-center gap-2 sm:gap-3">
              <span className="w-20 text-sm text-slate-600">{t(`voice:config.hours.days.${day}`)}</span>
              <Toggle
                size="sm"
                checked={h !== null}
                onChange={(on) => setDay(day, on ? { open: "09:00", close: "17:00" } : null)}
                label={t(`voice:config.hours.days.${day}`)}
              />
              {h === null ? (
                <span className="text-xs text-slate-400">{t("voice:config.hours.closed")}</span>
              ) : (
                <>
                  <input
                    type="time"
                    value={h.open}
                    onChange={(e) => setDay(day, { open: e.target.value, close: h.close })}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                  <span className="text-sm text-slate-400">{t("voice:config.hours.to")}</span>
                  <input
                    type="time"
                    value={h.close}
                    onChange={(e) => setDay(day, { open: h.open, close: e.target.value })}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <p className="text-xs font-medium text-slate-500">{t("setup.hours.types.title")}</p>
        <p className="mt-1 text-xs text-slate-400">{t("setup.hours.types.hint")}</p>
        <ul className="mt-2 space-y-2">
          {types.map((type, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <input
                value={type.name}
                readOnly={Boolean(type.existingId)}
                onChange={(e) => setTypes((prev) => prev.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                placeholder={t("setup.hours.types.namePlaceholder")}
                className={`${FIELD} flex-1 min-w-[180px] ${type.existingId ? "bg-slate-50 text-slate-500" : ""}`}
              />
              <input
                type="number"
                min={5}
                max={480}
                step={5}
                value={type.durationMinutes}
                readOnly={Boolean(type.existingId)}
                onChange={(e) =>
                  setTypes((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, durationMinutes: Number(e.target.value) || 30 } : x)),
                  )
                }
                className={`w-20 rounded-lg border border-slate-200 px-2 py-2 text-sm ${
                  type.existingId ? "bg-slate-50 text-slate-500" : ""
                }`}
              />
              <span className="text-xs text-slate-400">{t("setup.hours.types.minutes")}</span>
              {types.length > 1 && !type.existingId && (
                <button
                  type="button"
                  onClick={() => setTypes((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={t("setup.hours.types.remove")}
                  className="text-slate-300 hover:text-rose-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setTypes((prev) => [...prev, { name: "", durationMinutes: 30 }])}
          className={`${GHOST} mt-2`}
        >
          {t("setup.hours.types.add")}
        </button>
      </div>

      <Actions pending={pending} onSave={save} onSkip={() => onDone(false)} error={error} />
    </section>
  );
}

// ─── Step 4: the phone number ───────────────────────────────────────────────

/**
 * The number step is the SAME control Settings uses, deliberately.
 *
 * This began as a local copy of the escape hatch — a text box that records a
 * number you already own — because the code that really provisions one was
 * mounted nowhere and buying is the owner's money. #1794 then made that whole
 * flow honest and put it on Settings: four paths, purchase stated in full
 * before the button, and forwarding described as the carrier-side thing it
 * actually is rather than something HelmSmart does. A second, worse number UI
 * here would be exactly the local invention the house rules warn about, so the
 * step mounts `ReceptionistNumberSetup` and the owner configures one number in
 * one flow wherever they meet it.
 *
 * Nothing is bought without the owner opening that path and pressing its own
 * button, which names the cost first. The by-hand provider instructions keep
 * the id `NumberWiringStatus` links to, so "we can't repair this one" still
 * has somewhere to send them.
 */
function NumberStep({
  current,
  canManage,
  inboundUrl,
  functionUrl,
  onDone,
}: {
  current: string | null;
  canManage: boolean;
  inboundUrl: string;
  functionUrl: string;
  onDone: (ok: boolean) => void;
}) {
  const { t } = useTranslation("auth");

  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">{t("setup.number.title")}</h2>
      <p className="mt-1 text-sm text-slate-500">{t("setup.number.subtitle")}</p>

      <div className="mt-5">
        <ReceptionistNumberSetup
          current={current}
          canManage={canManage}
          manualHref="#receptionist-manual-wiring"
        />
      </div>

      <p className="text-sm text-slate-600">{t("setup.number.truth")}</p>

      <details id="receptionist-manual-wiring" className="mt-4 scroll-mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t("setup.number.manual.summary")}
        </summary>
        <ol className="my-3 list-inside list-decimal space-y-1.5 text-xs text-slate-600">
          <li>{t("setup.number.manual.step1")}</li>
          <li>{t("setup.number.manual.step2")}</li>
          <li>{t("setup.number.manual.step3")}</li>
        </ol>
        <div className="space-y-2.5">
          <CopyField
            label={t("setup.number.manual.inboundLabel")}
            value={inboundUrl}
            copyLabel={t("setup.number.manual.copy")}
          />
          <CopyField
            label={t("setup.number.manual.functionLabel")}
            value={functionUrl}
            copyLabel={t("setup.number.manual.copy")}
          />
        </div>
        <p className="mt-2 text-xs text-slate-400">{t("setup.number.manual.note")}</p>
      </details>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={() => onDone(true)} className={PRIMARY}>
          {t("setup.continue")}
        </button>
        <button type="button" onClick={() => onDone(false)} className={GHOST}>
          {t("setup.skip")}
        </button>
      </div>
    </section>
  );
}

// ─── Step 5: the first call ─────────────────────────────────────────────────

const POLL_MS = 4000;

function CallStep({ number, onArrived }: { number: string | null; onArrived: () => void }) {
  const { t } = useTranslation("auth");
  const router = useRouter();
  const [arrived, setArrived] = useState<{ at: string | null; fromNumber: string | null } | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (arrived) return;
    let live = true;
    async function check() {
      try {
        const res = await pollFirstCall();
        if (live && res.arrived) {
          setArrived({ at: res.at, fromNumber: res.fromNumber });
          onArrived();
        }
      } catch (e) {
        // A poll that fails is not an error the owner can act on — the next
        // one is four seconds away.
        console.error("[setup] poll for first call failed", e);
      }
    }
    void check();
    const id = setInterval(check, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [arrived]);

  async function checkNow() {
    setChecking(true);
    try {
      const res = await pollFirstCall();
      if (res.arrived) {
        setArrived({ at: res.at, fromNumber: res.fromNumber });
        onArrived();
      }
    } catch (e) {
      console.error("[setup] manual check failed", e);
    } finally {
      setChecking(false);
    }
  }

  return (
    <section>
      <h2 className="text-base font-semibold text-slate-900">{t("setup.call.title")}</h2>

      {arrived ? (
        <>
          <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" />
            {arrived.fromNumber
              ? t("setup.call.arrivedFrom", { number: arrived.fromNumber })
              : t("setup.call.arrived")}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => router.push("/home")} className={PRIMARY}>
              {t("setup.finish")}
            </button>
            <button type="button" onClick={() => router.push("/voice")} className={GHOST}>
              {t("setup.call.viewCalls")}
            </button>
          </div>
        </>
      ) : (
        <>
          {number ? (
            <p className="mt-2 text-sm text-slate-600">{t("setup.call.subtitle", { number })}</p>
          ) : (
            <p className="mt-2 text-sm text-slate-600">{t("setup.call.noNumber")}</p>
          )}
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
            <PhoneCall className="h-4 w-4 text-indigo-400" />
            {t("setup.call.waiting")}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button type="button" onClick={checkNow} disabled={checking} className={PRIMARY}>
              {checking && <Loader2 className="h-4 w-4 animate-spin" />}
              {checking ? t("setup.call.checking") : t("setup.call.checkNow")}
            </button>
            <button type="button" onClick={() => router.push("/home")} className={GHOST}>
              {t("setup.call.later")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

// ─── Small shared bits ──────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-500">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

/**
 * Save-and-continue, skip, and the error.
 *
 * The button does not flash "Saved!" — the house rule is for a control that
 * leaves you on the same screen, and this one moves you to the next step, so
 * the step changing IS the confirmation. The error still goes below the
 * control in rose with `role="alert"`.
 */
function Actions({
  pending,
  onSave,
  onSkip,
  error,
}: {
  pending: boolean;
  onSave: () => void;
  onSkip: () => void;
  error: string | null;
}) {
  const { t } = useTranslation("auth");
  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" onClick={onSave} disabled={pending} className={PRIMARY}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? t("setup.saving") : t("setup.saveAndContinue")}
        </button>
        <button type="button" onClick={onSkip} disabled={pending} className={GHOST}>
          {t("setup.skip")}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-xs text-rose-600" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
