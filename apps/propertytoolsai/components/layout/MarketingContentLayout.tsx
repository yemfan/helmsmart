import { ReactNode } from "react";
import Link from "next/link";
import Card from "@/components/ui/Card";

type Props = {
  title: string;
  eyebrow?: string;
  intro?: string;
  children: ReactNode;
};

/**
 * Legal / simple marketing text pages — card on soft gradient (CloseBoss-adjacent).
 */
export default function MarketingContentLayout({ title, eyebrow, intro, children }: Props) {
  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-50 via-white to-white">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.3]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(0,114,206,0.12), transparent 50%)",
        }}
      />
      <div className="relative mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        <Card className="p-6 sm:p-8 md:p-10">
          {eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-[#0072ce]">{eyebrow}</p>
          ) : null}
          <h1 className="font-heading mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
            {title}
          </h1>
          {intro ? <p className="mt-4 text-base leading-relaxed text-slate-600">{intro}</p> : null}
          <div className="mt-8 space-y-4 text-base leading-relaxed text-slate-600">{children}</div>
          <p className="mt-10 border-t border-slate-200/80 pt-6">
            <Link
              href="/"
              className="text-sm font-semibold text-[#0072ce] transition hover:text-[#005ca8]"
            >
              ← Back to Home
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
