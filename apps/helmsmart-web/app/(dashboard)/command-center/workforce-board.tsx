import type { WorkforceSummary } from "@helm/dna-intelligence";
import { SeedWorkforceButton } from "./seed-workforce-button";
import { EmployeeAvatarPicker } from "./employee-avatar-picker";
import { getServerT } from "@/lib/i18n/server";

/**
 * "calls_answered" → "Calls Answered", the fallback for a metric key with no
 * entry under `metrics.*`. See `command-center-view.tsx` for the same rule.
 */
function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function WorkforceBoard({
  summary,
  avatarById,
}: {
  summary: WorkforceSummary;
  /** employeeId → resolved avatar id (chosen, or a stable default). */
  avatarById: Record<string, string>;
}) {
  const t = await getServerT("home");
  const tc = await getServerT("common");

  if (summary.employees.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <h2 className="text-lg font-semibold text-slate-900">{t("commandCenter.board.emptyTitle")}</h2>
        <p className="text-sm text-slate-500 mt-1 mb-6 max-w-md mx-auto">
          {t("commandCenter.board.emptyBody")}
        </p>
        <SeedWorkforceButton />
      </div>
    );
  }

  const totalKeys = Object.keys(summary.totals);

  return (
    <div className="space-y-6">
      {/* Org-wide totals */}
      {totalKeys.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {totalKeys.map((k) => (
            <div key={k} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-2xl font-semibold text-slate-900">{summary.totals[k]}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t(`metrics.${k}`, { defaultValue: humanize(k) })}</p>
            </div>
          ))}
        </div>
      )}

      {/* Roster */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {summary.employees.map((e) => {
          const keys = Object.keys(e.metrics);
          return (
            <div key={e.employeeId} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-3">
                <EmployeeAvatarPicker
                  employeeId={e.employeeId}
                  name={e.name}
                  value={avatarById[e.employeeId] ?? "persona-01"}
                />
                <div>
                  <p className="font-semibold text-slate-900">{e.name}</p>
                  {/* Job title, not a name — translated like every other role badge. */}
                  <p className="text-xs text-slate-500">{tc(`aiRoles.${e.role}`, { defaultValue: e.role })}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
                {keys.length === 0 ? (
                  <p className="text-sm text-slate-400">{t("commandCenter.board.noActivity")}</p>
                ) : (
                  keys.map((k) => (
                    <div key={k}>
                      <p className="text-lg font-semibold text-slate-900">{e.metrics[k]}</p>
                      <p className="text-[11px] text-slate-500">{t(`metrics.${k}`, { defaultValue: humanize(k) })}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
