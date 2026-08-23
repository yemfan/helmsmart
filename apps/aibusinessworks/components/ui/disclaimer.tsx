import type { ReactNode } from "react";
import { cx } from "./primitives";

/**
 * The compliance primitive. Every surface that shows a rate, an example or a
 * total pairs it with one of these. Small, but never hidden and never grey on
 * grey - it has to be readable.
 */
export function Disclaimer({
  children,
  tone = "light",
  className,
  label = "Important",
}: {
  children: ReactNode;
  tone?: "light" | "dark" | "inline";
  className?: string;
  label?: string;
}) {
  if (tone === "inline") {
    return (
      <p className={cx("text-xs leading-relaxed text-muted", className)}>{children}</p>
    );
  }
  return (
    <div
      className={cx(
        "rounded-xl border px-4 py-3.5 text-xs leading-relaxed sm:px-5",
        tone === "dark"
          ? "border-white/12 bg-white/[0.04] text-navy-200"
          : "border-hairline bg-canvas-alt text-muted",
        className,
      )}
    >
      <span
        className={cx(
          "mr-2 font-semibold uppercase tracking-[0.12em]",
          tone === "dark" ? "text-navy-100" : "text-navy-600",
        )}
      >
        {label}
      </span>
      {children}
    </div>
  );
}
