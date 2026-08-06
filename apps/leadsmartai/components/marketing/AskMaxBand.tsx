import Image from "next/image";
import Link from "next/link";

/**
 * Site-wide "Ask Max" closing CTA.
 *
 * Introduces Max — the captain of the CloseBoss AI team — and drives to signup.
 * Rendered once, before the footer, on every marketing page (via
 * `MarketingChrome` in AppShell) so the "Ask Max" framing is consistent across
 * the whole public site. Deliberately self-contained (plain `next/image` +
 * `next/link`, no landing-page primitives) so it can drop into any page cheaply.
 *
 * Skipped on the homepage, which already leads with Max and ends with its own
 * final CTA — see `MarketingChrome`.
 */
export function AskMaxBand() {
  return (
    <section aria-label="Ask Max" className="px-4 pb-6 sm:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#0B1F44] px-6 py-10 shadow-xl ring-1 ring-white/10 sm:px-10 md:py-12">
        <div className="flex flex-col items-center gap-6 text-center md:flex-row md:justify-between md:gap-8 md:text-left">
          <div className="flex items-center gap-5">
            <Image
              src="/avatars/personas/max.png"
              alt="Max, the captain of your CloseBoss AI team"
              width={72}
              height={72}
              className="h-16 w-16 shrink-0 rounded-full border-2 border-[#F2C94C] object-cover sm:h-[72px] sm:w-[72px]"
              style={{ backgroundColor: "#0b1424" }}
            />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#F2C94C]">
                One captain. One AI team. Your success.
              </p>
              <h2 className="mt-1.5 font-heading text-2xl font-bold text-white sm:text-3xl">
                Don&apos;t do it all. <span className="text-[#FF941D]">Ask Max.</span>
              </h2>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-300">
                Tell Max what you need — he puts your whole AI team to work, around the clock.
              </p>
            </div>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-full bg-[#FF941D] px-8 text-base font-semibold text-[#0B1F44] shadow-lg transition hover:bg-[#ffa843] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F2C94C] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1F44]"
          >
            Ask Max free
          </Link>
        </div>
      </div>
    </section>
  );
}
