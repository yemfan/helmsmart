"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  TemplateCategory,
  TemplateChannel,
  TemplateStatus,
  TemplateWithOverride,
} from "@/lib/templates/types";
import { renderPreview } from "@/lib/templates/preview";
import { channelPreviewMaxChars, smsLengthForBody } from "@/lib/templates/formatters";

type CategoryFilter = "all" | TemplateCategory;
type ChannelFilter = "all" | TemplateChannel;
type StatusFilter = "all" | TemplateStatus;

const CATEGORY_LABEL: Record<TemplateCategory, string> = {
  sphere: "Sphere",
  lead_response: "Lead response",
  lifecycle: "Lifecycle",
};

export default function TemplatePickerClient() {
  const { t } = useTranslation("dashboard");
  const [items, setItems] = useState<TemplateWithOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/templates");
      const data = (await res.json()) as {
        ok?: boolean;
        templates?: TemplateWithOverride[];
        error?: string;
      };
      if (!res.ok || !data.ok || !data.templates) throw new Error(data.error || "Failed to load");
      setItems(data.templates);
      if (!selectedId && data.templates.length) setSelectedId(data.templates[0].id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    return items.filter((t) => {
      if (t.variantOf) return false; // collapse variants under parents
      if (category !== "all" && t.category !== category) return false;
      if (channel !== "all" && t.channel !== channel) return false;
      if (status !== "all" && t.effectiveStatus !== status) return false;
      if (search) {
        const needle = search.toLowerCase();
        if (
          !t.name.toLowerCase().includes(needle) &&
          !t.id.toLowerCase().includes(needle) &&
          !t.body.toLowerCase().includes(needle)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [items, search, category, channel, status]);

  const grouped = useMemo(() => {
    const out: Record<TemplateCategory, TemplateWithOverride[]> = {
      sphere: [],
      lead_response: [],
      lifecycle: [],
    };
    for (const t of visible) out[t.category].push(t);
    return out;
  }, [visible]);

  const selected = items.find((t) => t.id === selectedId) ?? null;

  function applyUpdate(next: TemplateWithOverride) {
    setItems((prev) => prev.map((t) => (t.id === next.id ? next : t)));
  }

  if (loading) {
    return <div className="p-6 text-sm text-gray-500" aria-busy="true">{t("pages.templatePicker.loadingTemplates")}</div>;
  }
  if (error) {
    return <div className="p-6 text-sm text-red-600">{error}</div>;
  }
  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">{t("pages.dashFragments.templateNotSeeded")}{" "}
        <code className="font-mono">node scripts/seed-message-templates.mjs</code> (with
        SUPABASE_SERVICE_ROLE_KEY set) to load the 20 templates from the handoff JSON.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
      <aside className="rounded-xl border border-gray-200 bg-white">
        <div className="space-y-2 border-b border-gray-100 p-3">
          <input
            type="search"
            placeholder={t("pages.templatePicker.searchByNameIdBody")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-3 gap-1.5">
            <SelectTiny
              value={category}
              onChange={(v) => setCategory(v as CategoryFilter)}
              options={[
                { value: "all", label: "All categories" },
                { value: "sphere", label: "Sphere" },
                { value: "lead_response", label: "Lead resp." },
                { value: "lifecycle", label: "Lifecycle" },
              ]}
            />
            <SelectTiny
              value={channel}
              onChange={(v) => setChannel(v as ChannelFilter)}
              options={[
                { value: "all", label: "All channels" },
                { value: "sms", label: "SMS" },
                { value: "email", label: "Email" },
              ]}
            />
            <SelectTiny
              value={status}
              onChange={(v) => setStatus(v as StatusFilter)}
              options={[
                { value: "all", label: "All status" },
                { value: "autosend", label: "Autosend" },
                { value: "review", label: t("common:actions.review") },
                { value: "off", label: "Off" },
              ]}
            />
          </div>
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {(Object.keys(grouped) as TemplateCategory[]).map((cat) => {
            const list = grouped[cat];
            if (!list.length) return null;
            return (
              <div key={cat}>
                <div className="sticky top-0 bg-gray-50/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 backdrop-blur">
                  {CATEGORY_LABEL[cat]} · {list.length}
                </div>
                <ul className="divide-y divide-gray-100">
                  {list.map((t) => {
                    const active = selectedId === t.id;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(t.id)}
                          className={`block w-full px-3 py-2 text-left transition-colors ${
                            active ? "bg-brand-accent/5" : "hover:bg-gray-50"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[10px] text-gray-500">{t.id}</span>
                            <StatusPill status={t.effectiveStatus} />
                          </div>
                          <div className="mt-0.5 truncate text-sm font-medium text-gray-900">
                            {t.name}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-gray-400">
                            <span>{t.channel}</span>
                            {t.override?.edited && (
                              <span className="text-brand-accent-text">· edited</span>
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          {!visible.length && (
            <div className="p-6 text-center text-sm text-gray-400">{t("pages.templatePicker.noMatches")}</div>
          )}
        </div>
      </aside>

      <main className="min-h-[400px] rounded-xl border border-gray-200 bg-white">
        {selected ? (
          <TemplateDetail template={selected} onUpdate={applyUpdate} />
        ) : (
          <div className="p-6 text-sm text-gray-500">{t("pages.templatePicker.selectOne")}</div>
        )}
      </main>
    </div>
  );
}

function SelectTiny({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function StatusPill({ status }: { status: TemplateStatus }) {
  const { t } = useTranslation("dashboard");
  const cls =
    status === "autosend"
      ? "bg-green-50 text-green-700"
      : status === "review"
        ? "bg-amber-50 text-amber-700"
        : "bg-gray-100 text-gray-500";
  const label =
    status === "autosend"
      ? t("pages.templatePicker.modeAuto")
      : status === "review"
        ? t("pages.templatePicker.modeReview")
        : t("pages.templatePicker.modeOff");
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function TemplateDetail({
  template,
  onUpdate,
}: {
  template: TemplateWithOverride;
  onUpdate: (next: TemplateWithOverride) => void;
}) {
  const { t } = useTranslation("dashboard");
  const [subject, setSubject] = useState(template.effectiveSubject ?? "");
  const [body, setBody] = useState(template.effectiveBody);
  const [status, setStatus] = useState<TemplateStatus>(template.effectiveStatus);
  const [previewMode, setPreviewMode] = useState<"rendered" | "raw">("rendered");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Reset local state when a different template is selected.
  useEffect(() => {
    setSubject(template.effectiveSubject ?? "");
    setBody(template.effectiveBody);
    setStatus(template.effectiveStatus);
    setMessage(null);
    setError(null);
  }, [template.id, template.effectiveSubject, template.effectiveBody, template.effectiveStatus]);

  const dirty =
    status !== template.effectiveStatus ||
    (template.channel === "email" && subject !== (template.effectiveSubject ?? "")) ||
    body !== template.effectiveBody;

  const maxChars = channelPreviewMaxChars(template.channel);
  const length = smsLengthForBody(body);
  const overLimit = template.channel === "sms" && length > 160;

  const rendered = useMemo(
    () =>
      renderPreview({
        subject: template.channel === "email" ? subject : null,
        body,
      }),
    [subject, body, template.channel],
  );

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const subjectOverride =
        template.channel === "email" && subject !== (template.subject ?? "") ? subject : null;
      const bodyOverride = body !== template.body ? body : null;

      const res = await fetch(`/api/dashboard/templates/${encodeURIComponent(template.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          subjectOverride,
          bodyOverride,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        template?: TemplateWithOverride;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.template) {
        throw new Error(data.error || "Save failed");
      }
      onUpdate(data.template);
      setMessage("Saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function revert() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/templates/${encodeURIComponent(template.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectOverride: null,
          bodyOverride: null,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        template?: TemplateWithOverride;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.template) throw new Error(data.error || "Revert failed");
      onUpdate(data.template);
      setSubject(data.template.effectiveSubject ?? "");
      setBody(data.template.effectiveBody);
      setStatus(data.template.effectiveStatus);
      setMessage("Reverted to base template.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-100 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-gray-500">{template.id}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  template.channel === "sms"
                    ? "bg-blue-50 text-blue-700"
                    : "bg-violet-50 text-violet-700"
                }`}
              >
                {template.channel}
              </span>
              <span className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">
                {CATEGORY_LABEL[template.category]}
              </span>
              {template.source === "invented" && (
                <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">{t("pages.templatePicker.needsReview")}</span>
              )}
            </div>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">{template.name}</h2>
            {template.notes && (
              <p className="mt-1 text-xs italic text-gray-500">{template.notes}</p>
            )}
          </div>
          <StatusSelect value={status} onChange={setStatus} />
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 divide-gray-100 lg:grid-cols-2 lg:divide-x">
        <section className="flex flex-col gap-3 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("pages.templatePicker.edit")}</div>

          {template.channel === "email" && (
            <label className="block">
              <span className="text-[11px] font-medium text-gray-500">{t("pages.templatePicker.subject")}</span>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </label>
          )}

          <label className="block flex-1">
            <span className="flex items-center justify-between text-[11px] font-medium text-gray-500">
              <span>{t("pages.templatePicker.body")}</span>
              {template.channel === "sms" && (
                <span className={overLimit ? "text-red-600" : "text-gray-400"}>
                  {length} / {maxChars ?? "—"}
                </span>
              )}
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={template.channel === "sms" ? 6 : 14}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono leading-relaxed"
            />
          </label>

          {template.placeholders.length > 0 && (
            <div>
              <span className="text-[11px] font-medium text-gray-500">{t("pages.templatePicker.placeholders")}</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {template.placeholders.map((p) => (
                  <span
                    key={p}
                    className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-600"
                  >
                    {`{{${p}}}`}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !dirty || overLimit}
              className="rounded-lg bg-brand-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? t("common:status.saving") : t("common:actions.save")}
            </button>
            {template.override?.edited && (
              <button
                type="button"
                onClick={() => void revert()}
                disabled={saving}
                className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50"
              >{t("pages.templatePicker.revert")}</button>
            )}
            {message && <span className="text-sm text-green-700">{message}</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        </section>

        <section className="flex flex-col p-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{t("pages.templatePicker.preview")}</div>
            <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs">
              {(["rendered", "raw"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPreviewMode(m)}
                  className={`rounded px-2 py-0.5 ${
                    previewMode === m ? "bg-white shadow-sm text-gray-900" : "text-gray-500"
                  }`}
                >
                  {m === "rendered" ? t("pages.templatePicker.rendered") : "Raw"}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex-1 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-4">
            {previewMode === "rendered" ? (
              <PreviewPane
                channel={template.channel}
                subject={rendered.subject}
                body={rendered.body}
              />
            ) : (
              <PreviewPane
                channel={template.channel}
                subject={template.channel === "email" ? subject : null}
                body={body}
                mono
              />
            )}
          </div>
          <div className="mt-2 text-[11px] text-gray-400">{t("pages.templatePicker.previewNote")}</div>
        </section>
      </div>
    </div>
  );
}

function PreviewPane({
  channel,
  subject,
  body,
  mono,
}: {
  channel: TemplateChannel;
  subject: string | null;
  body: string;
  mono?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className={`space-y-2 ${mono ? "font-mono text-xs" : "text-sm"}`}>
      {channel === "email" && subject !== null && (
        <div className="border-b border-gray-200 pb-2">
          <div className="text-[10px] uppercase tracking-wide text-gray-400">{t("pages.templatePicker.subject")}</div>
          <div className="text-gray-900">{subject || <span className="text-gray-400 italic">(empty)</span>}</div>
        </div>
      )}
      <pre
        className={`whitespace-pre-wrap ${mono ? "font-mono text-xs text-gray-700" : "font-sans text-gray-800 leading-relaxed"}`}
      >
        {body}
      </pre>
    </div>
  );
}

function StatusSelect({
  value,
  onChange,
}: {
  value: TemplateStatus;
  onChange: (v: TemplateStatus) => void;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <div className="inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs">
      {(["autosend", "review", "off"] as const).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className={`rounded px-2.5 py-1 font-medium ${
            value === s ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {s === "autosend"
            ? t("pages.templatePicker.modeAutosend")
            : s === "review"
              ? t("pages.templatePicker.modeReview")
              : t("pages.templatePicker.modeOff")}
        </button>
      ))}
    </div>
  );
}
