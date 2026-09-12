"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { setEmployeeAutonomyAction } from "@/lib/actions/ai-team";
import type { AutonomyLevel } from "@/lib/ai-team/autonomy";

/**
 * How much rope this teammate has, in the owner's words.
 *
 * Three choices at most, and only the ones that are real for this teammate —
 * the page works those out from the action registry. Each says what it means
 * for THIS person ("Emma texts a caller back herself" reads nothing like
 * "Alex emails a payment reminder"), because a level in the abstract is a
 * setting and a level in their words is a decision.
 *
 * A radio group rather than the house `Toggle`: a switch answers "on or off?",
 * and this has three answers. Saving says so on its own button and reverts the
 * selection if the write did not reach a row (`CLAUDE.md`).
 */
export function AutonomyDial({
  slug,
  name,
  levels,
  current,
  canChange,
}: {
  slug: string;
  name: string;
  levels: AutonomyLevel[];
  /** The level to show as chosen — `null` when the stored one is not offered. */
  current: AutonomyLevel | null;
  /** Owner or admin. Anyone else sees the setting and cannot move it. */
  canChange: boolean;
}) {
  const { t } = useTranslation("home");
  const router = useRouter();
  const [saved, setSaved] = useState<AutonomyLevel | null>(current);
  const [choice, setChoice] = useState<AutonomyLevel | null>(current);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = choice !== saved;
  const group = `autonomy-${slug}`;

  function save() {
    if (!choice) return;
    setError(null);
    start(async () => {
      let result: Awaited<ReturnType<typeof setEmployeeAutonomyAction>>;
      try {
        result = await setEmployeeAutonomyAction(slug, choice);
      } catch (e) {
        console.error("saving an AI teammate's autonomy", e);
        result = { ok: false, error: t("aiTeam.errors.saveFailed") };
      }
      if (!result.ok) {
        // The database did not take it: put the choice back where it was.
        setChoice(saved);
        setError(result.error);
        return;
      }
      setSaved(result.level);
      setConfirmed(true);
      setTimeout(() => setConfirmed(false), 2500);
      router.refresh();
    });
  }

  return (
    <div>
      <fieldset disabled={!canChange || pending} className="border-0 p-0 m-0">
        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("aiTeam.dial.legend", { name })}
        </legend>
        <div className="mt-2 space-y-2">
          {levels.map((level) => (
            <label
              key={level}
              className={`flex gap-2.5 rounded-lg px-2 py-1.5 -mx-2 ${
                canChange ? "cursor-pointer hover:bg-slate-50" : "cursor-default"
              }`}
            >
              <input
                type="radio"
                name={group}
                value={level}
                checked={choice === level}
                onChange={() => setChoice(level)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
              />
              <span className="min-w-0">
                <span className="block text-sm text-slate-800">{t(`aiTeam.levels.${level}`)}</span>
                <span className="block text-xs text-slate-500">
                  {t(`aiTeam.meaning.${slug}.${level}`, { name })}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {canChange ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !choice || (!dirty && !confirmed)}
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-40"
          >
            {pending
              ? t("common:status.saving")
              : confirmed
                ? t("common:actions.saved_bang", { defaultValue: "Saved!" })
                : t("aiTeam.dial.save")}
          </button>
          {error && (
            <p className="mt-1.5 text-xs text-rose-600" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-500">{t("aiTeam.dial.readOnly")}</p>
      )}
    </div>
  );
}
