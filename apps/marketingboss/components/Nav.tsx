"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
  const items = [
    { href: "/", label: "Studio" },
    { href: "/compose", label: "Posting" },
    { href: "/autopilot", label: "Autopilot" },
    { href: "/gallery", label: "Gallery" },
    { href: "/connections", label: "Connections" },
    { href: "/billing", label: "Billing & credits" },
  ];

  return (
    <header className="flex items-center gap-3">
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
            href="/billing"
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
                {items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-2 text-sm transition ${
                      pathname === it.href
                        ? "bg-slate-100 text-slate-900"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {it.label}
                  </Link>
                ))}
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
    </header>
  );
}
