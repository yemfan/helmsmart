"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarPicker } from "@helm/ui";
import { setEmployeeAvatarAction } from "@/lib/actions/workforce";

/**
 * The face an AI teammate wears. Click it to pick a different persona from the
 * 20-avatar gallery; the choice persists per employee.
 *
 * The new face shows at once, and goes back to the old one if the write did
 * not reach a row — a picker left showing a persona the database never took is
 * the same lie as a banner that says "Saved." over an unchanged row.
 */
export function EmployeeAvatarPicker({
  employeeId,
  name,
  value,
}: {
  employeeId: string;
  name: string;
  value: string;
}) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function choose(id: string) {
    const previous = current;
    setCurrent(id);
    setError(null);
    setOpen(false);
    start(async () => {
      let result: Awaited<ReturnType<typeof setEmployeeAvatarAction>>;
      try {
        result = await setEmployeeAvatarAction(employeeId, id);
      } catch (e) {
        console.error("saving an AI teammate's avatar", e);
        result = { ok: false, error: t("aiTeam.errors.saveFailed") };
      }
      if (!result.ok) {
        setCurrent(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        title={t("commandCenter.avatar.change", { name })}
        className="rounded-full ring-2 ring-transparent hover:ring-slate-200 transition disabled:opacity-60"
      >
        <Avatar id={current} size={48} alt={name} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 left-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <p className="text-xs font-semibold text-slate-700 mb-3">
              {t("commandCenter.avatar.choose", { name })}
            </p>
            <AvatarPicker value={current} onSelect={choose} size={48} disabled={pending} />
          </div>
        </>
      )}

      {error && (
        <p className="absolute left-0 top-full mt-1 w-40 text-xs text-rose-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
