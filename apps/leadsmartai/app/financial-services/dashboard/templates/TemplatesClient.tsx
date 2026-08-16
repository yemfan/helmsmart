"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MessageSquare, Mail, ShieldCheck, Filter } from "lucide-react";
import {
  FS_TEMPLATES,
  type FsTemplate,
  type FsTemplateCategory,
  type FsTemplateChannel,
} from "@/lib/financial-services/sms-templates";

const CATEGORIES: { id: FsTemplateCategory; label: string }[] = [
  { id: "prospect_intake", label: "Prospect intake" },
  { id: "appt_booking", label: "Appointment booking" },
  { id: "post_fna", label: "Post-FNA" },
  { id: "long_term_nurture", label: "Long-term nurture" },
  { id: "annual_review", label: "Annual review" },
  { id: "recruit_invite", label: "Recruit invite" },
  { id: "recruit_followup", label: "Recruit follow-up" },
  { id: "compliance_safe", label: "Compliance" },
];

export default function TemplatesClient() {
  const { t } = useTranslation("dashboard");
  const [channel, setChannel] = useState<"all" | FsTemplateChannel>("all");
  const [category, setCategory] = useState<"all" | FsTemplateCategory>("all");

  const filtered = useMemo(() => {
    return FS_TEMPLATES.filter(
      (t) =>
        (channel === "all" || t.channel === channel) &&
        (category === "all" || t.category === category)
    );
  }, [channel, category]);

  const byCat = useMemo(() => {
    const groups = new Map<FsTemplateCategory, FsTemplate[]>();
    filtered.forEach((t) => {
      const list = groups.get(t.category) ?? [];
      list.push(t);
      groups.set(t.category, list);
    });
    return groups;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t("pages.financialServices.templates")}</h1>
          <p className="mt-1 text-sm text-slate-600">{t("pages.financialServices.templatesSub")}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-1 py-1 text-xs">
          <Filter className="ml-2 h-3.5 w-3.5 text-slate-400" />
          {(["all", "sms", "email"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={[
                "rounded-full px-3 py-1.5 font-medium transition",
                channel === c
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100",
              ].join(" ")}
            >
              {c.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <CategoryChip
          label={t("pages.financialServices.all")}
          active={category === "all"}
          onClick={() => setCategory("all")}
        />
        {CATEGORIES.map((c) => (
          <CategoryChip
            key={c.id}
            label={c.label}
            active={category === c.id}
            onClick={() => setCategory(c.id)}
          />
        ))}
      </div>

      {Array.from(byCat.entries()).map(([cat, templates]) => {
        const catLabel = CATEGORIES.find((c) => c.id === cat)?.label ?? cat;
        return (
          <section key={cat} className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              {catLabel}
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {templates.map((t) => (
                <TemplateCard key={t.id} t={t} />
              ))}
            </div>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-500">{t("pages.financialServices.noTemplates")}</p>
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full px-3 py-1.5 text-xs font-medium transition",
        active
          ? "bg-slate-900 text-white"
          : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function TemplateCard({ t }: { t: FsTemplate }) {
  // The prop is already `t`, so the translator binds as `tr` here.
  const { t: tr } = useTranslation("dashboard");
  const Icon = t.channel === "sms" ? MessageSquare : Mail;
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={[
              "flex h-8 w-8 items-center justify-center rounded-lg",
              t.channel === "sms" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">{t.label}</p>
            <p className="text-xs text-slate-500">{t.description}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
          <ShieldCheck className="h-3 w-3" />{tr("pages.financialServices.complianceOk")}</span>
      </header>

      <pre className="mt-4 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-6 text-slate-700">
        {t.body}
      </pre>

      {t.tokens.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {t.tokens.map((tok) => (
            <span
              key={tok}
              className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-mono text-amber-800"
            >
              {tok}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
