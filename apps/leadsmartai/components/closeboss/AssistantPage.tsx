"use client";

import { useTranslation } from "react-i18next";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AssistantDef } from "@/lib/closeboss/team";
import { AssistantAvatar } from "@/components/closeboss/AssistantAvatar";
import { defaultAvatarForType } from "@/lib/closeboss/avatars";
import { TEAM_ACTIONS } from "@/lib/team-actions";
import { ArrowRight } from "lucide-react";

/** Header block shared by the AI-team pages — name, mission, skills, action links. */
type AssistantAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

export function AssistantHeader({
  assistant,
  actions,
}: {
  assistant: AssistantDef;
  actions?: AssistantAction[];
}) {
  const { t } = useTranslation("dashboard");
  // Overlay the agent's customized name + avatar (set on Manage Your AI Team)
  // so every assistant page shows the same identity, not the roster default.
  const [custom, setCustom] = useState<{
    name: string;
    avatar_id: string;
    avatar_url: string | null;
  } | null>(null);
  /**
   * The skills this agent actually has switched on, and the catalog that gives
   * them names and descriptions.
   *
   * The header used to chip out assistant.skills — the ROSTER default — so an
   * agent who turned a skill off still saw it advertised here, while
   * getAssistantVoiceSettings built the real call behaviour from
   * ai_assistants.enabled_skills. Two answers to "what can Emma do", and the
   * one on screen was the wrong one. Same endpoint, one more field.
   */
  const [enabledSkills, setEnabledSkills] = useState<string[] | null>(null);
  const [catalog, setCatalog] = useState<Record<string, { name: string; description: string }>>({});
  useEffect(() => {
    let active = true;
    fetch("/api/dashboard/closeboss/team")
      .then((r) => r.json())
      .then((res) => {
        if (!active || !res?.ok) return;
        const row = (res.assistants ?? []).find(
          (a: { type?: string }) => a.type === assistant.type,
        ) as {
          name?: string;
          avatar_id?: string;
          avatar_url?: string | null;
          enabled_skills?: unknown;
        } | undefined;
        const cat: Record<string, { name: string; description: string }> = {};
        for (const sk of (res.skills ?? []) as { key?: unknown; name?: unknown; description?: unknown }[]) {
          if (typeof sk.key === "string") {
            cat[sk.key] = {
              name: typeof sk.name === "string" ? sk.name : sk.key,
              description: typeof sk.description === "string" ? sk.description : "",
            };
          }
        }
        setCatalog(cat);
        if (Array.isArray(row?.enabled_skills)) {
          setEnabledSkills(row.enabled_skills.filter((v): v is string => typeof v === "string"));
        }
        if (row) {
          setCustom({
            name: row.name || assistant.displayName,
            avatar_id: row.avatar_id || defaultAvatarForType(assistant.type),
            avatar_url: row.avatar_url ?? null,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [assistant.type, assistant.name]);

  const name = assistant.displayName;
  // Roster defaults until the agent's own row arrives, so the card never
  // flashes empty and never claims a skill the agent switched off.
  const skills = enabledSkills ?? [...assistant.skills];
  const avatarId = custom?.avatar_id || defaultAvatarForType(assistant.type);
  const avatarUrl = custom?.avatar_url ?? null;

  return (
    <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <AssistantAvatar id={avatarId} url={avatarUrl} size={44} alt={name} className="mt-1" />
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{t("assistants.yourAiTeam")}</p>
          <h1 className="mt-0.5 text-xl font-semibold text-slate-900 dark:text-slate-100">{name}</h1>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{t(`roster.${assistant.type}.name`, { defaultValue: assistant.name })}</p>
          <p className="text-xs text-slate-400">{t(`assistants.personality.${assistant.type}`, { defaultValue: assistant.personality })}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:w-72">
        <AssistantSkillsCard skills={skills} catalog={catalog} />
        {actions && actions.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {actions.map((a) =>
              a.href ? (
                <Link key={a.label} href={a.href} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                  {a.label}
                </Link>
              ) : (
                <button key={a.label} type="button" onClick={a.onClick} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800">
                  {a.label}
                </button>
              ),
            )}
          </div>
        )}
      </div>
    </div>
    <AssistantActionsStrip type={assistant.type} />
    </>
  );
}

/** Roster type → TEAM_ACTIONS key. */
const ACTIONS_KEY: Record<string, string> = {
  receptionist: "receptionist",
  sales_assistant: "sales",
  marketing_assistant: "marketing",
  transaction_assistant: "transaction",
  accountant: "accountant",
};

/**
 * The assistant's actions, right under its header.
 *
 * They used to live one level down, on a separate "Actions" page reached from
 * a nested sidebar row — so getting to "CMA" was Sales Assistant → Actions →
 * CMA. The overview is the hub now; the sidebar row is a single link, and the
 * full Actions page stays reachable from the strip for the long tail.
 */
function AssistantActionsStrip({ type }: { type: string }) {
  const { t } = useTranslation(["dashboard", "dashboard_nav"]);
  const m = TEAM_ACTIONS[ACTIONS_KEY[type] ?? ""];
  if (!m || m.actions.length === 0) return null;
  return (
    <nav aria-label={t("assistants.actionsAria", { defaultValue: "Actions" })} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {m.actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group inline-flex shrink-0 items-center gap-2 rounded-xl border border-gray-200 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900"
          title={t(`actionsHub.desc.${a.href}`, { defaultValue: a.desc })}
        >
          <span className="text-gray-500 [&_svg]:h-4 [&_svg]:w-4">{a.icon}</span>
          {t(a.label, { ns: "dashboard_nav", defaultValue: a.label })}
        </Link>
      ))}
      <Link
        href={`${m.overviewHref}/actions`}
        className="inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium text-[#0072ce] hover:underline"
      >
        {t("assistants.allActions")}
        <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
      </Link>
    </nav>
  );
}

/**
 * What this assistant can do, as a panel rather than a chip row.
 *
 * Six pills wrapped under the personality line and pushed the KPI cards down
 * the page, so the first thing the eye met was a run of grey lozenges. As a
 * card it balances the header, and it has room to say what each skill IS —
 * the catalog carries a one-line description per skill and none of it was
 * reaching the screen.
 */
function AssistantSkillsCard({
  skills,
  catalog,
}: {
  skills: string[];
  catalog: Record<string, { name: string; description: string }>;
}) {
  const { t } = useTranslation("dashboard");
  if (skills.length === 0) return null;

  /** Catalog name first, then a translated key, then the humanised key. */
  function labelFor(key: string): string {
    const fromCatalog = catalog[key]?.name;
    if (fromCatalog) return fromCatalog;
    return t(`assistants.skills.${key}`, { defaultValue: key.replace(/_/g, " ") });
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {t("assistants.skillsHeading", { defaultValue: "Skills" })}
        </p>
        <span className="text-[10px] font-medium text-slate-400">{skills.length}</span>
      </div>
      <ul className="mt-2 space-y-1">
        {skills.map((key) => {
          const description = catalog[key]?.description;
          return (
            <li key={key} className="flex items-start gap-1.5 text-xs text-slate-700 dark:text-slate-300">
              <span aria-hidden className="mt-[6px] h-1 w-1 shrink-0 rounded-full bg-slate-300" />
              {/* The description is the useful half; kept in the title so the
                  card stays a card rather than a wall of prose. */}
              <span className="capitalize" title={description || undefined}>
                {labelFor(key)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** KPI stat card used on the AI-team pages. */
export function AssistantKpiCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string | undefined;
  hint?: string;
  tone?: "hot" | "warn";
}) {
  const valueClass = tone === "hot" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${valueClass}`}>{value ?? "—"}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}
