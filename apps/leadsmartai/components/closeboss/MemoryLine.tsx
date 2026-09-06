"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * One quiet line under the Ask Max composer: what Max is carrying into this
 * conversation, and where to see it. The audit's "context line" — the
 * visible half of the promise that a chief of staff remembers.
 */
export function MemoryLine() {
  const { t } = useTranslation("dashboard");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/boss/memories", { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { ok?: boolean; notes?: unknown[] }) => {
        if (!cancelled && b?.ok) setCount((b.notes ?? []).length);
      })
      .catch(() => {
        /* the line is decoration; the composer works without it */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (count === null) return null;
  return (
    <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
      {count > 0 ? t("boss.memoryLine.count", { count }) : t("boss.memoryLine.none")}{" "}
      <Link href="/dashboard/settings/ai-team#max-memory" className="font-medium text-slate-700 underline-offset-2 hover:underline dark:text-slate-300">
        {t("boss.memoryLine.manage")}
      </Link>
    </p>
  );
}
