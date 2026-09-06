import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** “Close More Deals with Less Work” feature grid — top accent + gradient (shared with PropertyTools AI). */
export const featureHighlightAccents = {
  primary: {
    borderTop: "border-t-[#0072ce]",
    gradientFrom: "from-[#0072ce]/[0.06]",
  },
  primaryDark: {
    borderTop: "border-t-[#005ca8]",
    gradientFrom: "from-[#005ca8]/[0.06]",
  },
  success: {
    borderTop: "border-t-[#28a745]",
    gradientFrom: "from-[#28a745]/[0.07]",
  },
  accent: {
    borderTop: "border-t-[#ff8c42]",
    gradientFrom: "from-[#ff8c42]/[0.08]",
  },
} as const;

export type FeatureHighlightAccent = keyof typeof featureHighlightAccents;

export function FeatureHighlightCard({
  accent,
  title,
  description,
  className,
}: {
  accent: FeatureHighlightAccent;
  title: ReactNode;
  description: string;
  className?: string;
}) {
  const a = featureHighlightAccents[accent];
  return (
    <div
      className={cn(
        // `shadow-raised` at rest + `shadow-floating` on hover comes
        // from the brand-tinted elevation tokens in `globals.css`. The
        // -0.5 translate is the matching vertical motion — without it
        // the shadow change reads as a flicker.
        "group rounded-xl border border-slate-200/90 border-t-4 bg-gradient-to-b to-slate-50/80 p-6 text-center shadow-raised transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-floating dark:to-slate-900/40",
        a.borderTop,
        a.gradientFrom,
        className
      )}
    >
      <p className="font-heading font-semibold text-slate-900 dark:text-slate-100">{title}</p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{description}</p>
    </div>
  );
}
