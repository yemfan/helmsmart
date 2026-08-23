"use client";

import { useState } from "react";
import { cx } from "@/components/ui/primitives";

/** A read-only value with a copy button that confirms what it did. */
export function CopyField({
  label,
  value,
  hint,
  mono = true,
}: {
  label: string;
  value: string;
  hint?: string;
  mono?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 2500);
  }

  return (
    <div>
      <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
        {label}
      </div>
      <div className="mt-2 flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className={cx(
            "min-w-0 flex-1 rounded-xl border border-hairline bg-canvas-alt px-3.5 py-2.5 text-sm text-ink outline-none",
            mono && "font-mono text-[13px]",
          )}
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-xl border border-hairline bg-white px-4 py-2.5 text-sm font-semibold text-navy-700 transition-colors hover:border-navy-300"
        >
          {state === "copied" ? "Copied" : state === "failed" ? "Select it" : "Copy"}
        </button>
      </div>
      {state === "failed" ? (
        <p className="mt-1.5 text-xs text-amber-700">
          Your browser blocked the clipboard. The value is selected above - copy it manually.
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
