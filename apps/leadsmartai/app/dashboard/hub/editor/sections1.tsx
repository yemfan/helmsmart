"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import {
  HUB_ACTION_KINDS,
  PUBLIC_WORKFORCE_TYPES,
  SERVICE_ICONS,
  SERVICE_PRESETS,
  ASSISTANT_TONES,
  type HubConfig,
  type HubCta,
  type HubService,
} from "@/lib/marketing-hub/config";
import type { SectionProps } from "../HubEditorClient";
import { saveSection } from "./types";
import {
  AddButton,
  Card,
  Empty,
  Field,
  RowControls,
  SaveButton,
  Select,
  SwitchRow,
  TextArea,
  TextInput,
  lines,
  move,
  newId,
  type SaveState,
} from "./ui";

/**
 * Editor sections, part one: Profile, Hero, Services, AI Assistant, AI
 * Workforce. Each keeps a draft of its slice, saves that slice alone, and
 * reports the outcome on the button.
 */

function useSave<K extends keyof HubConfig>(key: K, onSaved: SectionProps["onSaved"]) {
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  async function save(value: HubConfig[K]) {
    setState("saving");
    setError(null);
    const r = await saveSection(key, value);
    if (r.ok) {
      onSaved(r.data);
      setState("saved");
    } else {
      setError(r.message);
      setState("error");
    }
  }
  return { state, error, save };
}

// ── Profile ──────────────────────────────────────────────────────────────

export function ProfileSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.profile);
  const [bio, setBio] = useState(data.identity.bio ?? "");
  const [specialties, setSpecialties] = useState(data.identity.specialties.join(", "));
  const { state, error, save } = useSave("profile", onSaved);
  const [bioState, setBioState] = useState<SaveState>("idle");
  const notSet = t("pages.hubEditor.profile.notSet");
  const k = (s: string) => t(`pages.hubEditor.profile.${s}`);

  async function saveBio() {
    setBioState("saving");
    try {
      const res = await fetch("/api/dashboard/hub/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bio,
          specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error("save");
      onSaved({ ...data, identity: { ...data.identity, bio: json.bio ?? null, specialties: json.specialties ?? [] } });
      setBioState("saved");
    } catch {
      setBioState("error");
    }
  }

  return (
    <>
      <Card title={k("accountTitle")} description={k("accountDesc")}>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {[
            [k("name"), data.agent.name],
            [k("brokerage"), data.agent.brokerage],
            [k("phone"), data.agent.phone],
            [k("email"), data.agent.email],
            [k("license"), data.agent.licenseNumber],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className={value ? "text-slate-900" : "text-slate-400"}>{value || notSet}</dd>
            </div>
          ))}
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{k("photo")}</dt>
            <dd>
              {data.agent.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={data.agent.photoUrl} alt="" className="mt-1 h-12 w-12 rounded-full object-cover ring-1 ring-slate-200" />
              ) : (
                <span className="text-slate-400">{notSet}</span>
              )}
            </dd>
          </div>
        </dl>
        <Link href="/dashboard/settings" className="inline-flex text-sm font-medium text-[#0072ce] hover:underline">
          {k("editAccount")}
        </Link>
      </Card>

      <Card title={k("bioTitle")}>
        <Field label={k("bio")} hint={k("bioHint")}>
          <TextArea value={bio} onChange={setBio} rows={5} maxLength={2000} />
        </Field>
        <Field label={k("specialties")} hint={k("specialtiesHint")}>
          <TextInput value={specialties} onChange={setSpecialties} />
        </Field>
        <SaveButton state={bioState} onClick={() => void saveBio()} />
      </Card>

      <Card title={k("title")} description={k("desc")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={k("jobTitle")}>
            <TextInput value={d.title ?? ""} onChange={(v) => setD({ ...d, title: v || null })} maxLength={80} />
          </Field>
          <Field label={k("location")}>
            <TextInput value={d.location ?? ""} onChange={(v) => setD({ ...d, location: v || null })} maxLength={120} />
          </Field>
          <Field label={k("years")}>
            <TextInput
              type="number"
              value={d.yearsExperience == null ? "" : String(d.yearsExperience)}
              onChange={(v) => setD({ ...d, yearsExperience: v === "" ? null : Math.max(0, Math.min(70, Math.trunc(Number(v)) || 0)) })}
            />
          </Field>
          <Field label={k("website")}>
            <TextInput type="url" value={d.website ?? ""} onChange={(v) => setD({ ...d, website: v || null })} placeholder="https://" />
          </Field>
        </div>
        <Field label={k("languages")} hint={k("languagesHint")}>
          <TextInput value={d.languages.join(", ")} onChange={(v) => setD({ ...d, languages: v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8) })} />
        </Field>
        <Field label={k("credentials")} hint={k("credentialsHint")}>
          <TextInput value={d.credentials.join(", ")} onChange={(v) => setD({ ...d, credentials: v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8) })} />
        </Field>
        <SwitchRow checked={d.showPhone} onChange={(v) => setD({ ...d, showPhone: v })} label={k("showPhone")} />
        <SwitchRow checked={d.showEmail} onChange={(v) => setD({ ...d, showEmail: v })} label={k("showEmail")} />
        <SaveButton state={state} error={error} onClick={() => void save(d)} />
      </Card>
    </>
  );
}

// ── CTA list (shared by Hero and Final CTA) ──────────────────────────────

export function CtaListEditor({
  ctas,
  onChange,
  max = 3,
}: {
  ctas: HubCta[];
  onChange: (next: HubCta[]) => void;
  max?: number;
}) {
  const { t } = useTranslation("dashboard");
  const k = (s: string) => t(`pages.hubEditor.hero.${s}`);
  const actions = HUB_ACTION_KINDS.map((kind) => ({ value: kind, label: t(`pages.hubEditor.hero.actions.${kind}`) }));
  return (
    <div className="space-y-3">
      {ctas.length === 0 ? <Empty>{k("ctasHint")}</Empty> : null}
      {ctas.map((c, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-end">
          <Field label={k("ctaLabel")} hint={k("ctaLabelHint")} className="flex-1">
            <TextInput value={c.label ?? ""} onChange={(v) => onChange(ctas.map((x, j) => (j === i ? { ...x, label: v || null } : x)))} maxLength={60} />
          </Field>
          <Field label={k("ctaAction")} className="sm:w-48">
            <Select
              value={c.action.kind}
              options={actions}
              onChange={(v) => onChange(ctas.map((x, j) => (j === i ? { ...x, action: { ...x.action, kind: v as HubCta["action"]["kind"] } } : x)))}
            />
          </Field>
          {c.action.kind === "url" ? (
            <Field label={k("ctaUrl")} className="flex-1">
              <TextInput type="url" value={c.action.url ?? ""} onChange={(v) => onChange(ctas.map((x, j) => (j === i ? { ...x, action: { ...x.action, url: v || null } } : x)))} placeholder="https://" />
            </Field>
          ) : null}
          <RowControls index={i} count={ctas.length} onMove={(a, b) => onChange(move(ctas, a, b))} onRemove={() => onChange(ctas.filter((_, j) => j !== i))} />
        </div>
      ))}
      <AddButton disabled={ctas.length >= max} onClick={() => onChange([...ctas, { label: null, action: { kind: "contact", url: null } }])}>
        <Plus className="h-4 w-4" aria-hidden />
        {k("addCta")}
      </AddButton>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────

export function HeroSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.hero);
  const { state, error, save } = useSave("hero", onSaved);
  const k = (s: string) => t(`pages.hubEditor.hero.${s}`);
  return (
    <Card title={k("title")} description={k("desc")}>
      <Field label={k("headline")} hint={k("headlineHint")}>
        <TextInput value={d.headline ?? ""} onChange={(v) => setD({ ...d, headline: v || null })} maxLength={140} />
      </Field>
      <Field label={k("subheadline")}>
        <TextArea value={d.subheadline ?? ""} onChange={(v) => setD({ ...d, subheadline: v || null })} rows={2} maxLength={300} />
      </Field>
      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">{k("ctas")}</p>
        <CtaListEditor ctas={d.ctas} onChange={(ctas) => setD({ ...d, ctas })} />
      </div>
      <SaveButton state={state} error={error} onClick={() => void save(d)} />
    </Card>
  );
}

// ── Services ─────────────────────────────────────────────────────────────

export function ServicesSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.services);
  const { state, error, save } = useSave("services", onSaved);
  const k = (s: string) => t(`pages.hubEditor.services.${s}`);
  const presets = SERVICE_PRESETS.map((p) => ({ value: p, label: t(`pages.hubEditor.services.presets.${p}`) }));
  const icons = SERVICE_ICONS.map((i) => ({ value: i, label: t(`pages.hubEditor.services.icons.${i}`) }));
  const actions = HUB_ACTION_KINDS.map((kind) => ({ value: kind, label: t(`pages.hubEditor.hero.actions.${kind}`) }));
  const items = d.items;
  const set = (i: number, patch: Partial<HubService>) => setD({ ...d, items: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });

  return (
    <Card title={k("title")} description={k("desc")}>
      <SwitchRow checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label={k("enabled")} />
      <Field label={k("headline")}>
        <TextInput value={d.headline ?? ""} onChange={(v) => setD({ ...d, headline: v || null })} maxLength={120} />
      </Field>
      {items.length === 0 ? <Empty>{k("empty")}</Empty> : null}
      <div className="space-y-3">
        {items.map((s, i) => (
          <div key={s.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3">
              <SwitchRow checked={s.enabled} onChange={(v) => set(i, { enabled: v })} label={k("enabledItem")} />
              <RowControls index={i} count={items.length} onMove={(a, b) => setD({ ...d, items: move(items, a, b) })} onRemove={() => setD({ ...d, items: items.filter((_, j) => j !== i) })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={k("preset")}>
                <Select value={s.preset} options={presets} onChange={(v) => set(i, { preset: v as HubService["preset"] })} />
              </Field>
              <Field label={k("name")} hint={k("nameHint")}>
                <TextInput value={s.name ?? ""} onChange={(v) => set(i, { name: v || null })} maxLength={80} />
              </Field>
              <Field label={k("icon")}>
                <Select value={s.icon} options={icons} onChange={(v) => set(i, { icon: v as HubService["icon"] })} />
              </Field>
            </div>
            <Field label={k("description")}>
              <TextArea value={s.description ?? ""} onChange={(v) => set(i, { description: v || null })} rows={2} maxLength={400} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={k("cta")}>
                <Select value={s.cta.action.kind} options={actions} onChange={(v) => set(i, { cta: { ...s.cta, action: { ...s.cta.action, kind: v as HubCta["action"]["kind"] } } })} />
              </Field>
              <Field label={k("ctaLabel")}>
                <TextInput value={s.cta.label ?? ""} onChange={(v) => set(i, { cta: { ...s.cta, label: v || null } })} maxLength={60} />
              </Field>
              {s.cta.action.kind === "url" ? (
                <Field label={t("pages.hubEditor.hero.ctaUrl")}>
                  <TextInput type="url" value={s.cta.action.url ?? ""} onChange={(v) => set(i, { cta: { ...s.cta, action: { ...s.cta.action, url: v || null } } })} placeholder="https://" />
                </Field>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <AddButton
        disabled={items.length >= 12}
        onClick={() =>
          setD({
            ...d,
            items: [...items, { id: newId("svc"), preset: "custom", name: null, description: null, icon: "home", cta: { label: null, action: { kind: "contact", url: null } }, enabled: true }],
          })
        }
      >
        <Plus className="h-4 w-4" aria-hidden />
        {k("add")}
      </AddButton>
      <SaveButton state={state} error={error} onClick={() => void save(d)} />
    </Card>
  );
}

// ── AI Assistant ─────────────────────────────────────────────────────────

export function AssistantSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.assistant);
  const [prompts, setPrompts] = useState(d.suggestedPrompts.join("\n"));
  const { state, error, save } = useSave("assistant", onSaved);
  const k = (s: string) => t(`pages.hubEditor.assistant.${s}`);
  const tones = ASSISTANT_TONES.map((tone) => ({ value: tone, label: t(`pages.hubEditor.assistant.tones.${tone}`) }));
  return (
    <Card title={k("title")} description={k("desc")}>
      <SwitchRow checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label={k("enabled")} hint={k("enabledHint")} />
      <Field label={k("greeting")} hint={k("greetingHint")}>
        <TextArea value={d.greeting ?? ""} onChange={(v) => setD({ ...d, greeting: v || null })} rows={2} maxLength={400} />
      </Field>
      <Field label={k("prompts")} hint={k("promptsHint")}>
        <TextArea value={prompts} onChange={setPrompts} rows={4} />
      </Field>
      <Field label={k("knowledge")} hint={k("knowledgeHint")}>
        <TextArea value={d.knowledge ?? ""} onChange={(v) => setD({ ...d, knowledge: v || null })} rows={6} maxLength={6000} />
      </Field>
      <Field label={k("tone")}>
        <Select value={d.tone} options={tones} onChange={(v) => setD({ ...d, tone: v as typeof d.tone })} />
      </Field>
      <SwitchRow checked={d.captureLeads} onChange={(v) => setD({ ...d, captureLeads: v })} label={k("captureLeads")} hint={k("captureLeadsHint")} />
      <SwitchRow checked={d.offerPhone} onChange={(v) => setD({ ...d, offerPhone: v })} label={k("offerPhone")} />
      <SwitchRow checked={d.offerBooking} onChange={(v) => setD({ ...d, offerBooking: v })} label={k("offerBooking")} />
      <SaveButton state={state} error={error} onClick={() => void save({ ...d, suggestedPrompts: lines(prompts, 8).map((s) => s.slice(0, 80)) })} />
    </Card>
  );
}

// ── AI Workforce ─────────────────────────────────────────────────────────

export function WorkforceSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.workforce);
  const { state, error, save } = useSave("workforce", onSaved);
  const k = (s: string) => t(`pages.hubEditor.workforce.${s}`);
  const rows = data.workforce;
  const memberOf = (type: (typeof PUBLIC_WORKFORCE_TYPES)[number]) => d.members.find((m) => m.type === type);
  const setMember = (type: (typeof PUBLIC_WORKFORCE_TYPES)[number], patch: { visible?: boolean; description?: string | null }) => {
    const current = memberOf(type) ?? { type, visible: rows.find((r) => r.type === type)?.visible ?? true, description: null };
    const next = { ...current, ...patch };
    setD({ ...d, members: [...d.members.filter((m) => m.type !== type), next] });
  };
  return (
    <Card title={k("title")} description={k("desc")}>
      <SwitchRow checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label={k("enabled")} />
      <SwitchRow checked={d.showHowItWorks} onChange={(v) => setD({ ...d, showHowItWorks: v })} label={k("showHow")} hint={k("showHowHint")} />
      <div className="space-y-3">
        {rows.map((r) => {
          const m = memberOf(r.type);
          const visible = m ? m.visible : r.visible;
          const description = m ? m.description : r.description;
          return (
            <div key={r.type} className={`space-y-3 rounded-lg border p-3 ${r.available ? "border-slate-200" : "border-dashed border-slate-300 bg-slate-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <SwitchRow
                  checked={visible && r.available}
                  disabled={!r.available}
                  onChange={(v) => setMember(r.type, { visible: v })}
                  label={`${r.name || t(`pages.hubEditor.workforce.types.${r.type}`)} · ${t(`pages.hubEditor.workforce.types.${r.type}`)}`}
                  hint={r.available ? undefined : t(`pages.hubEditor.workforce.unavailable.${r.unavailableReason ?? "missing"}`)}
                />
              </div>
              {r.available ? (
                <Field label={k("description")} hint={k("descriptionHint")}>
                  <TextArea value={description ?? ""} onChange={(v) => setMember(r.type, { description: v || null })} rows={2} maxLength={300} />
                </Field>
              ) : null}
            </div>
          );
        })}
      </div>
      <Link href="/dashboard/ai-team" className="inline-flex text-sm font-medium text-[#0072ce] hover:underline">
        {k("manageTeam")}
      </Link>
      <SaveButton state={state} error={error} onClick={() => void save(d)} />
    </Card>
  );
}
