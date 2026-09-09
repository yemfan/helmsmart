"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { updateProject, type ProjectStatus } from "@/lib/actions/projects";
import { useRouter } from "next/navigation";

const STATUSES: { key: ProjectStatus; color: string }[] = [
  { key: "active",    color: "text-emerald-700 bg-emerald-100" },
  { key: "paused",    color: "text-amber-700 bg-amber-100" },
  { key: "completed", color: "text-indigo-700 bg-indigo-100" },
  { key: "cancelled", color: "text-slate-600 bg-slate-100" },
];

interface Props {
  projectId: string;
  currentStatus: ProjectStatus;
}

export function ProjectStatusToggle({ projectId, currentStatus }: Props) {
  const { t } = useTranslation("projects");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>(currentStatus);
  const [isPending, start] = useTransition();

  const current = STATUSES.find((s) => s.key === status) ?? STATUSES[0];

  function select(s: ProjectStatus) {
    setOpen(false);
    if (s === status) return;
    setStatus(s);
    start(async () => {
      await updateProject(projectId, { status: s });
      router.refresh();
    });
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${current.color} border-transparent hover:opacity-80 disabled:opacity-50`}
      >
        {t(`status.${current.key}`)}
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden min-w-[140px]">
            {STATUSES.map((s) => (
              <button
                key={s.key}
                onClick={() => select(s.key)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left hover:bg-slate-50 transition-colors"
              >
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${s.color}`}>{t(`status.${s.key}`)}</span>
                {s.key === status && <Check className="w-3.5 h-3.5 text-indigo-600" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
