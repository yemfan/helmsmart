"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import {
  BOOKING_MODES,
  HUB_ACCENTS,
  HUB_LAYOUTS,
  SOCIAL_NETWORKS,
  type FeaturedItem,
  type HubConfig,
} from "@/lib/marketing-hub/config";
import { HUB_TOOLS } from "@/lib/marketing-hub/tools";
import type { SectionProps } from "../HubEditorClient";
import { CtaListEditor } from "./sections1";
import { saveSection, type Testimonial } from "./types";
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

/** Editor sections, part two: Tools, Areas, Content, Social, Lead Capture, Trust, SEO, Appearance, Settings. */

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

// ── Tools ────────────────────────────────────────────────────────────────

export function ToolsSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.tools);
  const { state, error, save } = useSave("tools", onSaved);
  const k = (s: string) => t(`pages.hubEditor.tools.${s}`);
  const selected = d.keys;
  const unselected = HUB_TOOLS.filter((tool) => !selected.includes(tool.key));
  const name = (key: string) => t(`hub.tools.items.${key}.name`, { ns: "web_marketing" });
  return (
    <Card title={k("title")} description={k("desc")}>
      <SwitchRow checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label={k("enabled")} />
      <p className="text-xs text-slate-500">{k("hint")}</p>
      {selected.length === 0 ? <Empty>{k("empty")}</Empty> : null}
      <ul className="space-y-2">
        {selected.map((key, i) => (
          <li key={key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-3">
              <Toggle checked onChange={() => setD({ ...d, keys: selected.filter((x) => x !== key) })} label={name(key)} />
              <span className="text-sm font-medium text-slate-900">{name(key)}</span>
            </div>
            <RowControls index={i} count={selected.length} onMove={(a, b) => setD({ ...d, keys: move(selected, a, b) })} onRemove={() => setD({ ...d, keys: selected.filter((x) => x !== key) })} />
          </li>
        ))}
        {unselected.map((tool) => (
          <li key={tool.key} className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 px-3 py-2">
            <Toggle checked={false} onChange={() => setD({ ...d, keys: [...selected, tool.key] })} label={name(tool.key)} />
            <span className="text-sm text-slate-600">{name(tool.key)}</span>
          </li>
        ))}
      </ul>
      <SaveButton state={state} error={error} onClick={() => void save(d)} />
    </Card>
  );
}

// ── Market areas ─────────────────────────────────────────────────────────

export function AreasSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.areas);
  const { state, error, save } = useSave("areas", onSaved);
  const k = (s: string) => t(`pages.hubEditor.areas.${s}`);
  const items = d.items;
  return (
    <Card title={k("title")} description={k("desc")}>
      <SwitchRow checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label={k("enabled")} />
      <Field label={k("headline")} hint={k("headlineHint")}>
        <TextInput value={d.headline ?? ""} onChange={(v) => setD({ ...d, headline: v || null })} maxLength={120} />
      </Field>
      {items.length === 0 ? <Empty>{k("empty")}</Empty> : null}
      <div className="space-y-2">
        {items.map((a, i) => (
          <div key={i} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-end">
            <Field label={k("name")} className="flex-1">
              <TextInput value={a.name} onChange={(v) => setD({ ...d, items: items.map((x, j) => (j === i ? { ...x, name: v } : x)) })} maxLength={80} />
            </Field>
            <Field label={k("note")} className="flex-1">
              <TextInput value={a.note ?? ""} onChange={(v) => setD({ ...d, items: items.map((x, j) => (j === i ? { ...x, note: v || null } : x)) })} maxLength={160} />
            </Field>
            <RowControls index={i} count={items.length} onMove={(x, y) => setD({ ...d, items: move(items, x, y) })} onRemove={() => setD({ ...d, items: items.filter((_, j) => j !== i) })} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <AddButton disabled={items.length >= 24} onClick={() => setD({ ...d, items: [...items, { name: "", note: null }] })}>
          <Plus className="h-4 w-4" aria-hidden />
          {k("add")}
        </AddButton>
        {data.identity.profileAreas.length ? (
          <AddButton
            onClick={() =>
              setD({
                ...d,
                items: [...items, ...data.identity.profileAreas.filter((n) => !items.some((x) => x.name === n)).map((name) => ({ name, note: null }))].slice(0, 24),
              })
            }
          >
            {k("useProfile")}
          </AddButton>
        ) : null}
      </div>
      <SaveButton state={state} error={error} onClick={() => void save({ ...d, items: items.filter((a) => a.name.trim()) })} />
    </Card>
  );
}

// ── Content ──────────────────────────────────────────────────────────────

export function ContentSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.content);
  const { state, error, save } = useSave("content", onSaved);
  const k = (s: string) => t(`pages.hubEditor.content.${s}`);
  const kinds = (["post", "tool", "link"] as const).map((kind) => ({ value: kind, label: t(`pages.hubEditor.content.kinds.${kind}`) }));
  const posts = data.posts.map((p) => ({ value: p.slug, label: p.title }));
  const tools = HUB_TOOLS.map((tool) => ({ value: tool.key, label: t(`hub.tools.items.${tool.key}.name`, { ns: "web_marketing" }) }));
  const items = d.featured;
  const set = (i: number, patch: Partial<FeaturedItem>) => setD({ ...d, featured: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
  return (
    <>
      <Card title={k("title")} description={k("desc")}>
        <SwitchRow checked={d.showFeed} onChange={(v) => setD({ ...d, showFeed: v })} label={k("showFeed")} />
        <SaveButton state={state} error={error} onClick={() => void save(d)} />
      </Card>
      <Card title={k("featuredTitle")} description={k("featuredDesc")}>
        {items.length === 0 ? <Empty>{k("empty")}</Empty> : null}
        <div className="space-y-3">
          {items.map((f, i) => (
            <div key={f.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
              <div className="flex items-end justify-between gap-3">
                <Field label={k("kind")} className="w-40">
                  <Select value={f.kind} options={kinds} onChange={(v) => set(i, { kind: v as FeaturedItem["kind"], ref: "" })} />
                </Field>
                <RowControls index={i} count={items.length} onMove={(a, b) => setD({ ...d, featured: move(items, a, b) })} onRemove={() => setD({ ...d, featured: items.filter((_, j) => j !== i) })} />
              </div>
              {f.kind === "post" ? (
                posts.length ? (
                  <Field label={k("post")}>
                    <Select value={f.ref} options={[{ value: "", label: "—" }, ...posts]} onChange={(v) => set(i, { ref: v })} />
                  </Field>
                ) : (
                  <p className="text-xs text-slate-500">{k("noPosts")}</p>
                )
              ) : f.kind === "tool" ? (
                <Field label={k("tool")}>
                  <Select value={f.ref} options={[{ value: "", label: "—" }, ...tools]} onChange={(v) => set(i, { ref: v })} />
                </Field>
              ) : (
                <Field label={k("url")}>
                  <TextInput type="url" value={f.ref} onChange={(v) => set(i, { ref: v })} placeholder="https://" />
                </Field>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={k("titleField")}>
                  <TextInput value={f.title ?? ""} onChange={(v) => set(i, { title: v || null })} maxLength={120} />
                </Field>
                <Field label={k("badge")} hint={k("badgeHint")}>
                  <TextInput value={f.badge ?? ""} onChange={(v) => set(i, { badge: v || null })} maxLength={40} />
                </Field>
              </div>
              <Field label={k("description")}>
                <TextArea value={f.description ?? ""} onChange={(v) => set(i, { description: v || null })} rows={2} maxLength={300} />
              </Field>
            </div>
          ))}
        </div>
        <AddButton disabled={items.length >= 6} onClick={() => setD({ ...d, featured: [...items, { id: newId("feat"), kind: "post", ref: "", title: null, description: null, badge: null }] })}>
          <Plus className="h-4 w-4" aria-hidden />
          {k("add")}
        </AddButton>
        <SaveButton state={state} error={error} onClick={() => void save({ ...d, featured: items.filter((f) => f.ref.trim()) })} />
      </Card>
    </>
  );
}

// ── Social ───────────────────────────────────────────────────────────────

const NETWORK_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  threads: "Threads",
  linkedin: "LinkedIn",
  x: "X",
};

export function SocialSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.social);
  const { state, error, save } = useSave("social", onSaved);
  const k = (s: string) => t(`pages.hubEditor.social.${s}`);
  return (
    <Card title={k("title")} description={k("desc")}>
      <p className="text-xs text-slate-500">{k("hint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {SOCIAL_NETWORKS.map((n) => (
          <Field key={n} label={NETWORK_LABEL[n]}>
            <TextInput type="url" value={d[n] ?? ""} onChange={(v) => setD({ ...d, [n]: v || null })} placeholder="https://" />
          </Field>
        ))}
      </div>
      <SaveButton state={state} error={error} onClick={() => void save(d)} />
    </Card>
  );
}

// ── Lead capture ─────────────────────────────────────────────────────────

export function LeadCaptureSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.leadCapture);
  const { state, error, save } = useSave("leadCapture", onSaved);
  const k = (s: string) => t(`pages.hubEditor.leadCapture.${s}`);
  const modes = BOOKING_MODES.map((m) => ({
    value: m,
    label: t(`pages.hubEditor.leadCapture.modes.${m}`),
    disabled: m === "receptionist" && !data.bookingEnabled,
  }));
  return (
    <>
      <Card title={k("title")} description={k("desc")}>
        <SwitchRow checked={d.showForm} onChange={(v) => setD({ ...d, showForm: v })} label={k("showForm")} />
        <div>
          <p className="text-sm font-semibold text-slate-900">{k("bookingTitle")}</p>
          <Field label={k("bookingMode")} hint={t(`pages.hubEditor.leadCapture.modeHint.${d.bookingMode}`)}>
            <Select value={d.bookingMode} options={modes} onChange={(v) => setD({ ...d, bookingMode: v as typeof d.bookingMode })} />
          </Field>
          {!data.bookingEnabled ? <p className="mt-1 text-xs text-amber-700">{k("receptionistOff")}</p> : null}
          <Field label={k("externalUrl")} className="mt-3">
            <TextInput type="url" value={d.externalBookingUrl ?? ""} onChange={(v) => setD({ ...d, externalBookingUrl: v || null })} placeholder="https://calendly.com/…" />
          </Field>
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{k("notifyTitle")}</p>
          <SwitchRow checked={d.notifyEmail} onChange={(v) => setD({ ...d, notifyEmail: v })} label={k("notifyEmail")} />
          <SwitchRow checked={d.notifyPush} onChange={(v) => setD({ ...d, notifyPush: v })} label={k("notifyPush")} />
          <SwitchRow checked={d.createTask} onChange={(v) => setD({ ...d, createTask: v })} label={k("createTask")} />
          <SwitchRow checked={d.enrollFollowUp} onChange={(v) => setD({ ...d, enrollFollowUp: v })} label={k("enrollFollowUp")} />
        </div>
        <SaveButton state={state} error={error} onClick={() => void save(d)} />
      </Card>
      <FinalCtaCard data={data} onSaved={onSaved} />
    </>
  );
}

function FinalCtaCard({ data, onSaved }: Pick<SectionProps, "data" | "onSaved">) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.finalCta);
  const { state, error, save } = useSave("finalCta", onSaved);
  const k = (s: string) => t(`pages.hubEditor.finalCta.${s}`);
  return (
    <Card title={k("title")} description={k("desc")}>
      <SwitchRow checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label={k("enabled")} />
      <Field label={k("headline")}>
        <TextInput value={d.headline ?? ""} onChange={(v) => setD({ ...d, headline: v || null })} maxLength={120} />
      </Field>
      <Field label={k("body")}>
        <TextArea value={d.body ?? ""} onChange={(v) => setD({ ...d, body: v || null })} rows={2} maxLength={300} />
      </Field>
      <CtaListEditor ctas={d.ctas} onChange={(ctas) => setD({ ...d, ctas })} />
      <SaveButton state={state} error={error} onClick={() => void save(d)} />
    </Card>
  );
}

// ── Trust ────────────────────────────────────────────────────────────────

export function TrustSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.trust);
  const [points, setPoints] = useState(d.points.join("\n"));
  const { state, error, save } = useSave("trust", onSaved);
  const k = (s: string) => t(`pages.hubEditor.trust.${s}`);
  return (
    <>
      <Card title={k("title")} description={k("desc")}>
        <SwitchRow checked={d.enabled} onChange={(v) => setD({ ...d, enabled: v })} label={k("enabled")} />
        <Field label={k("headline")}>
          <TextInput value={d.headline ?? ""} onChange={(v) => setD({ ...d, headline: v || null })} maxLength={120} />
        </Field>
        <Field label={k("points")} hint={k("pointsHint")}>
          <TextArea value={points} onChange={setPoints} rows={4} />
        </Field>
        <SwitchRow checked={d.showTestimonials} onChange={(v) => setD({ ...d, showTestimonials: v })} label={k("showTestimonials")} />
        <SaveButton state={state} error={error} onClick={() => void save({ ...d, points: lines(points, 8).map((s) => s.slice(0, 160)) })} />
      </Card>
      <TestimonialsCard />
    </>
  );
}

function TestimonialsCard() {
  const { t } = useTranslation("dashboard");
  const k = (s: string) => t(`pages.hubEditor.trust.${s}`);
  const [list, setList] = useState<Testimonial[] | null>(null);
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [authorTitle, setAuthorTitle] = useState("");
  const [rating, setRating] = useState("");
  const [state, setState] = useState<SaveState>("idle");

  useEffect(() => {
    fetch("/api/dashboard/hub/testimonials")
      .then((r) => r.json())
      .then((j) => setList(j?.ok ? (j.testimonials as Testimonial[]) : []))
      .catch(() => setList([]));
  }, []);

  async function call(method: string, payload?: Record<string, unknown>, query = "") {
    const res = await fetch(`/api/dashboard/hub/testimonials${query}`, {
      method,
      headers: { "content-type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    const j = await res.json().catch(() => ({}));
    if (!j?.ok) throw new Error("save");
    setList(j.testimonials as Testimonial[]);
  }

  async function add() {
    if (!body.trim()) return;
    setState("saving");
    try {
      await call("POST", { body, authorName: author, authorTitle, rating: rating ? Number(rating) : null, published: true });
      setBody("");
      setAuthor("");
      setAuthorTitle("");
      setRating("");
      setState("saved");
    } catch {
      setState("error");
    }
  }

  const ratings = [{ value: "", label: k("noRating") }, ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: "★".repeat(n) }))];

  return (
    <Card title={k("testimonialsTitle")} description={k("testimonialsDesc")}>
      {list === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-slate-100" />
      ) : list.length === 0 ? (
        <Empty>{k("empty")}</Empty>
      ) : (
        <ul className="space-y-2">
          {list.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-800">{item.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {[item.authorName, item.authorTitle].filter(Boolean).join(" · ")}
                  {item.rating ? ` · ${"★".repeat(item.rating)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Toggle checked={item.published} onChange={(v) => void call("PATCH", { id: item.id, published: v }).catch(() => {})} label={item.published ? k("published") : k("unpublished")} />
                <span className="text-xs text-slate-500">{item.published ? k("published") : k("unpublished")}</span>
                <button
                  type="button"
                  onClick={() => void call("DELETE", undefined, `?id=${encodeURIComponent(item.id)}`).catch(() => {})}
                  className="text-xs font-medium text-red-700 hover:underline"
                >
                  {t("pages.hubEditor.remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 rounded-lg border border-dashed border-slate-300 p-3">
        <Field label={k("body")}>
          <TextArea value={body} onChange={setBody} rows={3} maxLength={1200} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={k("author")}>
            <TextInput value={author} onChange={setAuthor} maxLength={120} />
          </Field>
          <Field label={k("authorTitle")}>
            <TextInput value={authorTitle} onChange={setAuthorTitle} maxLength={120} />
          </Field>
          <Field label={k("rating")}>
            <Select value={rating} options={ratings} onChange={setRating} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <AddButton onClick={() => void add()} disabled={!body.trim() || state === "saving"}>
            <Plus className="h-4 w-4" aria-hidden />
            {k("add")}
          </AddButton>
          {state === "error" ? (
            <p role="alert" className="text-sm text-red-700">
              {k("addFailed")}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

// ── SEO ──────────────────────────────────────────────────────────────────

export function SeoSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.seo);
  const { state, error, save } = useSave("seo", onSaved);
  const k = (s: string) => t(`pages.hubEditor.seo.${s}`);
  const name = data.agent.name || data.identity.brandName || (data.identity.username ? `@${data.identity.username}` : "");
  const previewTitle = d.title?.trim() || [name, data.config.profile.location].filter(Boolean).join(" · ");
  const previewDesc = d.description?.trim() || (data.identity.bio ?? "").slice(0, 155);
  return (
    <Card title={k("title")} description={k("desc")}>
      <Field label={k("pageTitle")} hint={k("pageTitleHint")}>
        <TextInput value={d.title ?? ""} onChange={(v) => setD({ ...d, title: v || null })} maxLength={120} />
      </Field>
      <Field label={k("description")} hint={k("descriptionHint")}>
        <TextArea value={d.description ?? ""} onChange={(v) => setD({ ...d, description: v || null })} rows={3} maxLength={320} />
      </Field>
      <Field label={k("keywords")} hint={k("keywordsHint")}>
        <TextInput value={d.keywords.join(", ")} onChange={(v) => setD({ ...d, keywords: v.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12) })} />
      </Field>
      <Field label={k("ogImage")} hint={k("ogImageHint")}>
        <TextInput type="url" value={d.ogImageUrl ?? ""} onChange={(v) => setD({ ...d, ogImageUrl: v || null })} placeholder="https://" />
      </Field>
      <SwitchRow checked={d.noindex} onChange={(v) => setD({ ...d, noindex: v })} label={k("noindex")} hint={k("noindexHint")} />
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{k("preview")}</p>
        <p className="mt-1 text-base font-medium text-[#1a0dab]">{previewTitle}</p>
        <p className="text-xs text-emerald-700">closebossai.com/@{data.identity.username ?? "…"}</p>
        <p className="mt-1 text-sm text-slate-700">{previewDesc}</p>
      </div>
      <SaveButton state={state} error={error} onClick={() => void save(d)} />
    </Card>
  );
}

// ── Appearance ───────────────────────────────────────────────────────────

const SWATCH: Record<string, string> = {
  navy: "bg-slate-900",
  blue: "bg-[#0072ce]",
  emerald: "bg-emerald-700",
  gold: "bg-amber-500",
  slate: "bg-slate-600",
};

export function AppearanceSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const [d, setD] = useState(data.config.appearance);
  const [footer, setFooter] = useState(data.config.footer);
  const { state, error, save } = useSave("appearance", onSaved);
  const footerSave = useSave("footer", onSaved);
  const k = (s: string) => t(`pages.hubEditor.appearance.${s}`);
  return (
    <>
      <Card title={k("title")} description={k("desc")}>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">{k("accent")}</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {HUB_ACCENTS.map((a) => {
              const on = d.accent === a;
              return (
                <button
                  key={a}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setD({ ...d, accent: a })}
                  className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
                >
                  <span className={`h-4 w-4 rounded-full ${SWATCH[a]}`} aria-hidden />
                  {t(`pages.hubEditor.appearance.accents.${a}`)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium text-slate-700">{k("layout")}</legend>
          <div className="mt-2 grid gap-2">
            {HUB_LAYOUTS.map((l) => {
              const on = d.layout === l;
              return (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setD({ ...d, layout: l })}
                  className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm ${on ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
                >
                  <span className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${on ? "border-white bg-white" : "border-slate-400"}`} aria-hidden />
                  {t(`pages.hubEditor.appearance.layouts.${l}`)}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-slate-500">{k("layoutHint")}</p>
        </fieldset>
        <SaveButton state={state} error={error} onClick={() => void save(d)} />
      </Card>
      <Card title={k("disclosure")} description={k("disclosureHint")}>
        <TextArea value={footer.disclosure ?? ""} onChange={(v) => setFooter({ disclosure: v || null })} rows={4} maxLength={600} />
        <SaveButton state={footerSave.state} error={footerSave.error} onClick={() => void footerSave.save(footer)} />
      </Card>
    </>
  );
}

// ── Settings (handle, publish, tracking ids) ─────────────────────────────

type Tracking = { metaPixelId: string | null; gaMeasurementId: string | null; pixelActive: boolean };
type ProfileMeta = { willBeIndexed: boolean; postedItems: number };

export function SettingsSection({ data, onSaved }: SectionProps) {
  const { t } = useTranslation("dashboard");
  const k = (s: string) => t(`pages.hubEditor.settings.${s}`);
  const [username, setUsername] = useState(data.identity.username ?? "");
  const [meta, setMeta] = useState<ProfileMeta | null>(null);
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [pixel, setPixel] = useState("");
  const [ga, setGa] = useState("");
  const [state, setState] = useState<SaveState>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [tState, setTState] = useState<SaveState>("idle");

  useEffect(() => {
    Promise.all([fetch("/api/dashboard/hub/profile").then((r) => r.json()), fetch("/api/dashboard/hub/tracking").then((r) => r.json())])
      .then(([p, tr]) => {
        if (p?.ok) setMeta({ willBeIndexed: Boolean(p.willBeIndexed), postedItems: Number(p.postedItems ?? 0) });
        if (tr?.ok) {
          setTracking(tr as Tracking);
          setPixel(tr.metaPixelId ?? "");
          setGa(tr.gaMeasurementId ?? "");
        }
      })
      .catch(() => {});
  }, []);

  async function saveIdentity(patch: { username?: string; published?: boolean }) {
    setState("saving");
    setErr(null);
    try {
      const res = await fetch("/api/dashboard/hub/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json?.ok) {
        setErr(json?.error ?? null);
        setState("error");
        return;
      }
      onSaved({ ...data, identity: { ...data.identity, username: json.username ?? null, published: Boolean(json.published) } });
      setMeta({ willBeIndexed: Boolean(json.willBeIndexed), postedItems: Number(json.postedItems ?? 0) });
      setState("saved");
    } catch {
      setState("error");
    }
  }

  async function saveTracking() {
    setTState("saving");
    try {
      const res = await fetch("/api/dashboard/hub/tracking", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ metaPixelId: pixel, gaMeasurementId: ga }),
      });
      const json = await res.json();
      if (!json?.ok) throw new Error("save");
      setTracking((prev) => (prev ? { ...prev, metaPixelId: pixel || null, gaMeasurementId: ga || null, pixelActive: Boolean(json.pixelActive) } : prev));
      setTState("saved");
    } catch {
      setTState("error");
    }
  }

  return (
    <>
      <Card title={k("title")} description={k("desc")}>
        <div className="flex items-center gap-3">
          <Toggle checked={data.identity.published} onChange={(v) => void saveIdentity({ published: v })} label={k("publish")} />
          <span className="text-sm font-medium text-slate-900">{k("publish")}</span>
        </div>
        <p className="text-xs text-slate-500">{data.identity.published ? k("publishHintOn") : k("publishHintOff")}</p>
        {meta ? (
          <p className="text-xs text-slate-500">
            {t("pages.hubEditor.settings.postedItems", { count: meta.postedItems })} · {meta.willBeIndexed ? k("willBeIndexed") : k("willNotBeIndexed")}
          </p>
        ) : null}
        <Field label={k("username")} hint={k("usernameHint")}>
          <div className="mt-1 flex items-center gap-1">
            <span className="text-slate-500">@</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20" autoComplete="off" spellCheck={false} />
          </div>
        </Field>
        <SaveButton state={state} error={err} onClick={() => void saveIdentity({ username: username.trim() })} />
      </Card>
      <Card title={k("trackingTitle")}>
        <Field label={k("ga")} hint={k("gaHint")}>
          <TextInput value={ga} onChange={setGa} />
        </Field>
        <Field label={k("pixel")} hint={`${k("pixelHint")}${pixel && tracking ? ` · ${tracking.pixelActive ? k("pixelActive") : k("pixelNeedsPremium")}` : ""}`}>
          <TextInput value={pixel} onChange={setPixel} />
        </Field>
        <p className="text-xs text-slate-500">{k("privacyNote")}</p>
        <SaveButton state={tState} onClick={() => void saveTracking()} />
      </Card>
      <Card title={k("dangerTitle")} description={k("dangerDesc")}>
        <Link href="/dashboard/settings" className="inline-flex text-sm font-medium text-[#0072ce] hover:underline">
          {k("accountSettings")}
        </Link>
      </Card>
    </>
  );
}
