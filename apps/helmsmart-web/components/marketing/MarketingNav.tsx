"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Menu, X } from "lucide-react";
import { HelmLogo } from "@/components/logo";
import { LanguageToggle } from "@/components/language-toggle";

// The href is a route, not copy; the label is a key into the `site` bundle.
const navLinks = [
  { key: "product", href: "/features" },
  { key: "pricing", href: "/pricing" },
  { key: "schedule", href: "/login?next=/calendar/book" },
  { key: "faq", href: "/faq" },
  { key: "blog", href: "/blog" },
];

export function MarketingNav() {
  const { t } = useTranslation("site");
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-100 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo + wordmark */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <HelmLogo className="h-8 w-8" />
          <span className="text-lg font-semibold tracking-tight text-gray-900">
            HelmSmart<span style={{ color: "#1E88E5" }}>.ai</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {t(`nav.${link.key}`)}
            </Link>
          ))}
        </nav>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <LanguageToggle />
          <Link
            href="/login"
            className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
          >
            {t("nav.signIn")}
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {t("nav.startFree")}
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen((prev) => !prev)}
          className="inline-flex items-center justify-center rounded-md p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 md:hidden"
          aria-label={mobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="border-t border-gray-100 bg-white md:hidden">
          <nav className="flex flex-col px-4 py-3 gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                {t(`nav.${link.key}`)}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
              <div className="px-3 py-1">
                <LanguageToggle />
              </div>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="rounded-md px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                {t("nav.signIn")}
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700"
              >
                {t("nav.startFree")}
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
