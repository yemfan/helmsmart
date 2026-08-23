import type { ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export function Container({
  children,
  className,
  width = "default",
}: {
  children: ReactNode;
  className?: string;
  width?: "default" | "wide" | "narrow";
}) {
  const max =
    width === "wide" ? "max-w-7xl" : width === "narrow" ? "max-w-3xl" : "max-w-6xl";
  return <div className={cx("mx-auto w-full px-5 sm:px-8", max, className)}>{children}</div>;
}

type SectionTone = "light" | "alt" | "dark" | "navy";

const SECTION_TONES: Record<SectionTone, string> = {
  light: "bg-white text-ink",
  alt: "bg-canvas-alt text-ink",
  dark: "bg-navy-950 text-white",
  navy: "bg-navy-900 text-white",
};

export function Section({
  children,
  tone = "light",
  className,
  id,
  grid = false,
  size = "default",
}: {
  children: ReactNode;
  tone?: SectionTone;
  className?: string;
  id?: string;
  /** Faint node texture behind the section. */
  grid?: boolean;
  size?: "default" | "tight" | "roomy";
}) {
  const padding =
    size === "tight" ? "py-14 sm:py-16" : size === "roomy" ? "py-24 sm:py-32" : "py-20 sm:py-24";
  return (
    <section
      id={id}
      className={cx(
        "relative",
        SECTION_TONES[tone],
        padding,
        grid && (tone === "dark" || tone === "navy" ? "abw-grid" : "abw-grid-light"),
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Eyebrow({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <p
      className={cx(
        "text-[0.7rem] font-semibold uppercase tracking-[0.18em]",
        tone === "dark" ? "text-cyan-accent" : "text-navy-500",
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  tone = "light",
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  lead?: ReactNode;
  tone?: "light" | "dark";
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cx(
        align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-3xl",
        className,
      )}
    >
      {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
      <h2
        className={cx(
          "mt-3 text-3xl leading-[1.1] font-semibold sm:text-4xl lg:text-[2.75rem]",
          tone === "dark" ? "text-white" : "text-ink",
        )}
      >
        {title}
      </h2>
      {lead ? (
        <div
          className={cx(
            "mt-5 text-lg leading-relaxed",
            tone === "dark" ? "text-navy-200" : "text-muted",
          )}
        >
          {lead}
        </div>
      ) : null}
    </div>
  );
}

export function Card({
  children,
  className,
  tone = "light",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  tone?: "light" | "dark" | "outline";
  interactive?: boolean;
}) {
  const tones = {
    light: "bg-white border-hairline shadow-card",
    dark: "bg-navy-900 border-white/10 text-white",
    outline: "bg-transparent border-hairline",
  } as const;
  return (
    <div
      className={cx(
        "rounded-2xl border p-6 sm:p-7",
        tones[tone],
        interactive && "transition-shadow duration-200 hover:shadow-lift",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "cyan" | "gold" | "navy" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-navy-50 text-navy-700 ring-navy-100",
    cyan: "bg-cyan-soft text-[#12657c] ring-[#bfe6f0]",
    gold: "bg-gold-soft text-[#7a6122] ring-[#e6d5a8]",
    navy: "bg-navy-900 text-white ring-navy-900",
    success: "bg-emerald-50 text-emerald-800 ring-emerald-100",
    warning: "bg-amber-50 text-amber-800 ring-amber-100",
    danger: "bg-rose-50 text-rose-800 ring-rose-100",
  } as const;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Hairline({ className }: { className?: string }) {
  return <hr className={cx("border-0 border-t border-hairline", className)} />;
}
