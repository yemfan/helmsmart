"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Primary app sections — the 2.0 workflow: discover → decide → act → learn.
// Home is mission control; Studio holds the pro tools; Published is the record.
const NAV = [
  { href: "/", label: "Home", emoji: "🏠" },
  { href: "/opportunities", label: "Opportunities", emoji: "🎯" },
  { href: "/actions", label: "Actions", emoji: "⚡" },
  { href: "/playbooks", label: "Playbooks", emoji: "📚" },
  { href: "/studio", label: "Studio", emoji: "🧰" },
  { href: "/published", label: "Published", emoji: "📢" },
  { href: "/learning", label: "Learning", emoji: "📈" },
];

export default function Nav({ email, credits }: { email: string; credits?: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initial = (email?.[0] ?? "?").toUpperCase();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const settingsActive = pathname.startsWith("/settings");

  return (
    <header className="flex flex-col gap-3">
      {/* Top row — brand + credits + account */}
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="MarketingBoss" className="size-10 rounded-xl ring-1 ring-slate-200" />
          <div>
            <h1 className="text-lg font-bold leading-tight tracking-tight">
              Marketing<span className="text-boss-gold">Boss</span>
            </h1>
            <p className="text-[11px] text-slate-500">Cinematic marketing creative on demand</p>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {typeof credits === "number" && (
            <Link
              href="/settings?tab=billing"
              title="Generation credits — click to buy more"
              className="rounded-full border border-boss-gold/30 bg-boss-gold/10 px-2.5 py-1 text-xs font-semibold text-boss-gold transition hover:bg-boss-gold/20"
            >
              {credits} credits <span className="opacity-70">+</span>
            </Link>
          )}

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-2.5 text-sm transition hover:bg-slate-100"
            >
              <span className="grid size-7 place-items-center rounded-full bg-boss-violet text-xs font-bold text-white">
                {initial}
              </span>
              <span className="hidden max-w-[160px] truncate text-slate-900 sm:inline">{email}</span>
              <span className="text-[10px] text-slate-400">▼</span>
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
              >
                <div className="border-b border-slate-200 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Signed in</div>
                  <div className="truncate text-sm text-slate-900">{email}</div>
                </div>
                <nav className="py-1.5">
                  <Link
                    href="/settings"
                    onClick={() => setOpen(false)}
                    className="block px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    Settings
                  </Link>
                </nav>
                <div className="border-t border-slate-200 py-1.5">
                  <button
                    onClick={signOut}
                    className="block w-full px-4 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-500/10"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top-level menu — the primary sections + Settings */}
      <nav className="-mx-1 flex items-center gap-1 overflow-x-auto border-b border-slate-200 px-1">
        {NAV.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`shrink-0 border-b-2 px-2.5 py-2 text-sm font-medium transition ${
                active
                  ? "border-boss-violet text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <span aria-hidden className="mr-1 hidden sm:inline">{it.emoji}</span>
              {it.label}
            </Link>
          );
        })}
        <Link
          href="/settings"
          aria-label="Settings"
          className={`ml-auto flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
            settingsActive
              ? "border-boss-violet text-slate-900"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <span aria-hidden>⚙</span> Settings
        </Link>
      </nav>
    </header>
  );
}
