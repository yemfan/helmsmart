"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";

/**
 * A collapsed "Advanced" block inside a settings card.
 *
 * Several panels grew a long tail of things almost nobody changes — free-text
 * style notes, a brand colour, read-only previews of what the AI will sound
 * like — sitting in the same visual weight as the two or three settings people
 * actually come for. The panel then reads as a wall, and the decision that
 * matters is somewhere in the middle of it.
 *
 * Collapsed, not removed: these are real settings, and an agent who wants them
 * should not have to guess they exist. The summary says how many are inside so
 * the block is not a mystery box.
 */
export default function AdvancedSection({
  children,
  count,
}: {
  children: React.ReactNode;
  /** How many settings are inside, shown on the summary line. */
  count?: number;
}) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-slate-100 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          strokeWidth={2}
          aria-hidden
        />
        {t("pages.advancedSection.label")}
        {typeof count === "number" && count > 0 ? (
          <span className="text-slate-400">{t("pages.advancedSection.count", { count })}</span>
        ) : null}
      </button>

      {open ? <div className="mt-3 space-y-4">{children}</div> : null}
    </div>
  );
}
