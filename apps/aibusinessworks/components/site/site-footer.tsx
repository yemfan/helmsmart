import Link from "next/link";
import { FOOTER_NAV, SITE } from "@/lib/site";
import { Container } from "@/components/ui/primitives";
import { Wordmark } from "./brand";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-navy-950 text-navy-200">
      <Container width="wide">
        <div className="grid gap-12 py-16 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Wordmark tone="dark" />
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-navy-300">
              {SITE.tagline}
            </p>
            <p className="mt-6 font-display text-sm font-semibold tracking-tight text-white">
              {SITE.philosophy.join(" ")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {FOOTER_NAV.map((group) => (
              <div key={group.heading}>
                <h2 className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-white">
                  {group.heading}
                </h2>
                <ul className="mt-4 space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.href + link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-navy-300 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-white/10 py-8">
          <p className="text-xs leading-relaxed text-navy-400">
            AI Business Works does not guarantee any level of income. Commission rates, durations,
            qualification requirements and customer discounts describe the structure of the
            compensation plan and are subject to the official AI Business Works Partner Program
            Terms. Any figures or examples shown on this site are illustrations, not forecasts and
            not typical results.
          </p>
          <div className="mt-6 flex flex-col gap-3 text-xs text-navy-400 sm:flex-row sm:items-center sm:justify-between">
            <p>
              &copy; {year} {SITE.name}. All rights reserved.
            </p>
            <p>
              Partners are independent contractors and are not employees or agents of{" "}
              {SITE.name}.
            </p>
          </div>
        </div>
      </Container>
    </footer>
  );
}
