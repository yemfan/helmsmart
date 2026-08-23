import type { ReactNode } from "react";
import { ECOSYSTEM } from "@/content/products";
import { PRODUCTS } from "@/content/products";
import { cx } from "@/components/ui/primitives";

/* -------------------------------------------------------------------------- */
/*  Ecosystem                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The master brand and its five branches, with the products sitting under the
 * Partner Program branch. Built from layout rather than a fixed-size SVG so it
 * reflows honestly on a phone instead of shrinking to unreadable.
 */
export function EcosystemDiagram() {
  return (
    <div className="relative">
      <div className="rounded-3xl border border-white/12 bg-white/[0.04] p-6 sm:p-8">
        <div className="text-center">
          <div className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-cyan-accent">
            Master AI Business Ecosystem
          </div>
          <div className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            AI Business Works
          </div>
        </div>

        <div className="mx-auto mt-6 h-8 w-px bg-white/20" aria-hidden="true" />

        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {ECOSYSTEM.map((branch) => (
            <li
              key={branch.key}
              className={cx(
                "rounded-2xl border p-4",
                branch.key === "partners"
                  ? "border-gold-accent/40 bg-gold-accent/[0.08]"
                  : "border-white/12 bg-white/[0.03]",
              )}
            >
              <div
                className={cx(
                  "font-display text-sm font-semibold tracking-tight",
                  branch.key === "partners" ? "text-gold-accent" : "text-white",
                )}
              >
                {branch.name}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-navy-300">{branch.detail}</p>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-6 h-8 w-px bg-white/20" aria-hidden="true" />

        <div className="rounded-2xl border border-white/12 bg-navy-950/60 p-4">
          <div className="text-center text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-navy-300">
            Solutions a Partner can recommend
          </div>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PRODUCTS.map((product) => (
              <li
                key={product.key}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-center text-sm font-medium text-white"
              >
                {product.name}
              </li>
            ))}
            <li className="rounded-xl border border-dashed border-white/15 px-3 py-2.5 text-center text-sm text-navy-400">
              Future AI products
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Flow                                                                       */
/* -------------------------------------------------------------------------- */

export function FlowDiagram({
  steps,
  tone = "light",
}: {
  steps: { label: string; detail?: string; emphasis?: boolean }[];
  tone?: "light" | "dark";
}) {
  return (
    <ol className="grid gap-2 lg:grid-flow-col lg:auto-cols-fr lg:items-stretch">
      {steps.map((step, i) => (
        <li key={step.label} className="contents">
          <div
            className={cx(
              "flex flex-col justify-center rounded-2xl border px-4 py-4 text-center",
              tone === "dark"
                ? step.emphasis
                  ? "border-gold-accent/40 bg-gold-accent/[0.08]"
                  : "border-white/12 bg-white/[0.04]"
                : step.emphasis
                  ? "border-gold-accent/50 bg-gold-soft"
                  : "border-hairline bg-white shadow-card",
            )}
          >
            <div
              className={cx(
                "text-[0.7rem] font-semibold uppercase tracking-[0.14em]",
                tone === "dark"
                  ? step.emphasis
                    ? "text-gold-accent"
                    : "text-white"
                  : step.emphasis
                    ? "text-[#7a6122]"
                    : "text-navy-900",
              )}
            >
              {step.label}
            </div>
            {step.detail ? (
              <div
                className={cx(
                  "mt-1.5 text-xs leading-relaxed",
                  tone === "dark" ? "text-navy-300" : "text-muted",
                )}
              >
                {step.detail}
              </div>
            ) : null}
          </div>
          {i < steps.length - 1 ? (
            <div
              aria-hidden="true"
              className={cx(
                "flex items-center justify-center text-lg leading-none",
                tone === "dark" ? "text-navy-400" : "text-navy-300",
              )}
            >
              <span className="lg:hidden">&#8595;</span>
              <span className="hidden lg:inline">&#8594;</span>
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/*  One generation                                                             */
/* -------------------------------------------------------------------------- */

function ChainNode({
  name,
  role,
  tone,
}: {
  name: string;
  role: string;
  tone: "leader" | "partner" | "customer" | "muted";
}) {
  const tones = {
    leader: "border-gold-accent/50 bg-gold-soft text-[#7a6122]",
    partner: "border-navy-200 bg-white text-navy-900",
    customer: "border-cyan-accent/40 bg-cyan-soft text-[#12657c]",
    muted: "border-dashed border-hairline bg-canvas-alt text-muted",
  } as const;
  return (
    <div className={cx("rounded-xl border px-4 py-3 text-center", tones[tone])}>
      <div className="text-sm font-semibold">{name}</div>
      <div className="mt-0.5 text-[0.68rem] uppercase tracking-[0.12em] opacity-80">{role}</div>
    </div>
  );
}

function Chain({ children }: { children: ReactNode }) {
  return <div className="grid gap-2">{children}</div>;
}

function Arrow() {
  return (
    <div aria-hidden="true" className="text-center text-navy-300">
      &#8595;
    </div>
  );
}

/** Side-by-side: where a single-generation override pays, and where it does not. */
export function GenerationDiagram({ overrideLabel }: { overrideLabel: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-hairline bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-50 text-xs font-bold text-emerald-700">
            &#10003;
          </span>
          <h3 className="text-sm font-semibold text-ink">Override applies</h3>
        </div>
        <Chain>
          <div className="mt-4" />
          <ChainNode name="Sarah" role="Qualified Leader" tone="leader" />
          <Arrow />
          <ChainNode name="David" role="Sarah's Direct Partner" tone="partner" />
          <Arrow />
          <ChainNode name="Customer" role="Referred by David" tone="customer" />
        </Chain>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          David receives his direct commission. Sarah may receive the {overrideLabel} Leadership
          Override on the same qualifying revenue, because David is her Direct Partner.
        </p>
      </div>

      <div className="rounded-2xl border border-hairline bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-50 text-xs font-bold text-rose-700">
            &#10005;
          </span>
          <h3 className="text-sm font-semibold text-ink">Override does not apply</h3>
        </div>
        <Chain>
          <div className="mt-4" />
          <ChainNode name="Sarah" role="Qualified Leader" tone="muted" />
          <Arrow />
          <ChainNode name="David" role="Sarah's Direct Partner" tone="partner" />
          <Arrow />
          <ChainNode name="Lisa" role="David's Direct Partner" tone="partner" />
          <Arrow />
          <ChainNode name="Customer" role="Referred by Lisa" tone="customer" />
        </Chain>
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Lisa receives her direct commission and David may receive the first-generation override.
          Sarah receives nothing from Lisa&apos;s customer - the default plan pays one generation.
        </p>
      </div>
    </div>
  );
}
