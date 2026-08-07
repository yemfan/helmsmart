import Link from "next/link";

/**
 * Public marketing top nav for marketingbossai.com — the logged-out chrome.
 * Mirrors the CloseBoss marketing nav's shape (logo left, section links, Sign
 * in + a primary CTA right) in MarketingBoss's own violet/gold light brand.
 * Server component: a few anchor links + buttons, no JS menu needed.
 */
export function PublicNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5" aria-label="MarketingBoss home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="size-9 rounded-xl ring-1 ring-line" />
          <span className="text-[17px] font-bold leading-none tracking-tight text-ink">
            Marketing<span className="text-boss-gold">Boss</span>
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-6 text-sm font-medium text-ink-3 md:flex">
          <a href="#how" className="transition hover:text-ink">How it works</a>
          <a href="#make" className="transition hover:text-ink">What you can make</a>
          <a href="#pricing" className="transition hover:text-ink">Pricing</a>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-ink-3 transition hover:text-ink sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="rounded-lg bg-boss-gold px-4 py-2 text-sm font-semibold text-black shadow-sm transition hover:brightness-105"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}
