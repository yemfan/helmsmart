"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

/**
 * The site menu on phones: a button in the header, a sheet of page links.
 *
 * Closes on navigation and on Escape, locks scroll while open, and is a
 * plain list of links — a visitor should never need to learn a widget to
 * find the Contact page.
 */
export default function HubMobileNav({
  items,
  label,
  closeLabel,
}: {
  items: { href: string; label: string }[];
  label: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!items.length) return null;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-expanded={open}
        aria-controls="hub-mobile-menu"
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={label} id="hub-mobile-menu">
          <button type="button" aria-label={closeLabel} onClick={() => setOpen(false)} className="absolute inset-0 bg-slate-900/40" />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col bg-white shadow-[var(--shadow-modal)]">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-500">{label}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={closeLabel}
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <ul>
                {items.map((i) => (
                  <li key={i.href}>
                    <Link
                      href={i.href}
                      onClick={() => setOpen(false)}
                      className="flex min-h-12 items-center rounded-lg px-3 text-base font-medium text-slate-800 hover:bg-slate-50"
                    >
                      {i.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}
