"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Avatar, AvatarPicker } from "@helm/ui";
import { setEmployeeAvatarAction } from "@/lib/actions/workforce";

/**
 * The avatar shown for an AI employee on the workforce board. Click it to pick a
 * different persona from the 20-avatar gallery; the choice persists per employee.
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
  const [pending, start] = useTransition();
  const router = useRouter();

  function choose(id: string) {
    setCurrent(id);
    setOpen(false);
    start(async () => {
      await setEmployeeAvatarAction(employeeId, id);
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
        <Avatar id={current} size={40} alt={name} />
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
    </div>
  );
}
