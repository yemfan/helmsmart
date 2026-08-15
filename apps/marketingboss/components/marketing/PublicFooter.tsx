import Link from "next/link";

// Sibling businesses under MAXY Investment — cross-promoted in every footer.
// This app is MarketingBoss, so it links to the other three.
const PARTNERS = [
  { label: "Property Tools AI", blurb: "Real estate tools & data", href: "https://www.propertytoolsai.com" },
  { label: "HelmSmart", blurb: "AI operating system for business", href: "https://helmsmart.ai" },
  { label: "CloseBoss", blurb: "Your AI real estate team", href: "https://www.closebossai.com" },
];

/**
 * Public marketing footer for marketingbossai.com. Mirrors the CloseBoss
 * footer's column + legal-line shape in MarketingBoss's own brand.
 */
export function PublicFooter() {
  return (
    <footer className="mt-20 border-t border-line/80 bg-white/60">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <Link href="/" className="flex items-center gap-2.5" aria-label="MarketingBoss home">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="size-8 rounded-lg ring-1 ring-line" />
              <span className="text-[15px] font-bold tracking-tight text-ink">
                Marketing<span className="text-boss-gold">Boss</span>
              </span>
            </Link>
            <p className="mt-3 max-w-[15rem] text-[13px] leading-relaxed text-ink-3">
              Cinematic marketing creative on demand — generate and publish, pay-as-you-go.
            </p>
          </div>

          <FooterCol
            heading="Product"
            links={[
              { label: "How it works", href: "/#how" },
              { label: "What you can make", href: "/#make" },
              { label: "Pricing", href: "/pricing" },
              { label: "Sign in", href: "/login" },
            ]}
          />
          <FooterCol
            heading="Learn"
            links={[
              { label: "Guides", href: "/guides" },
              { label: "Compare", href: "/compare" },
              { label: "Get started", href: "/login" },
              { label: "Contact", href: "mailto:contact@marketingbossai.com" },
            ]}
          />
          <FooterCol
            heading="Legal"
            links={[
              { label: "Privacy Policy", href: "/privacy" },
              { label: "Terms of Service", href: "/terms" },
            ]}
          />
        </div>

        {/* Business partners — our sibling products */}
        <div className="mt-10 border-t border-line/80 pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-3">Business partners</h3>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {PARTNERS.map((p) => (
              <li key={p.href}>
                <a
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-ink-3 transition-colors hover:text-boss-violet"
                >
                  {p.label} <span className="text-slate-400">· {p.blurb}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-2 border-t border-line/80 pt-6 text-xs text-ink-3 sm:flex-row sm:items-center">
          <span>&copy; {new Date().getFullYear()} MarketingBoss. All rights reserved.</span>
          <span className="text-slate-400">Powered by fal.ai</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ heading, links }: { heading: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <h3 className="text-sm font-semibold tracking-wide text-ink">{heading}</h3>
      <ul className="mt-4 space-y-2.5">
        {links.map((l) => (
          <li key={l.href + l.label}>
            <Link href={l.href} className="text-sm text-ink-3 transition-colors hover:text-boss-violet">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
