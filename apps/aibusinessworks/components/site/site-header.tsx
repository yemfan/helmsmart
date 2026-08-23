"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CTA, PRIMARY_NAV, SITE } from "@/lib/site";
import { ButtonLink } from "@/components/ui/button";
import { Container, cx } from "@/components/ui/primitives";
import { Wordmark } from "./brand";

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A route change should never leave the mobile sheet hanging open.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-white/85 backdrop-blur-md">
      <Container width="wide">
        <div className="flex h-16 items-center justify-between gap-6 sm:h-18">
          <Link href="/" className="shrink-0" aria-label={`${SITE.name} home`}>
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
            {PRIMARY_NAV.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-navy-50 text-navy-900"
                      : "text-navy-600 hover:bg-navy-50 hover:text-navy-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <ButtonLink href={CTA.login.href} variant="ghost" size="sm">
              {CTA.login.label}
            </ButtonLink>
            <ButtonLink href={CTA.primary.href} variant="primary" size="sm">
              {CTA.primary.label}
            </ButtonLink>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="inline-flex items-center justify-center rounded-lg border border-hairline p-2.5 text-navy-700 lg:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true" fill="none">
              {open ? (
                <path
                  d="M5 5l10 10M15 5L5 15"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M3 6h14M3 10h14M3 14h14"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </Container>

      {open ? (
        <div id="mobile-nav" className="border-t border-hairline bg-white lg:hidden">
          <Container>
            <nav className="grid gap-1 py-4" aria-label="Primary mobile">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2.5 text-[15px] font-medium text-navy-700 hover:bg-navy-50"
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-3 grid gap-2 border-t border-hairline pt-4">
                <ButtonLink href={CTA.login.href} variant="secondary">
                  {CTA.login.label}
                </ButtonLink>
                <ButtonLink href={CTA.primary.href} variant="primary">
                  {CTA.primary.label}
                </ButtonLink>
              </div>
            </nav>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
