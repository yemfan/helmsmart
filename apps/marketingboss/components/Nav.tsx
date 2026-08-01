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
    { href: "/gallery", label: "Gallery" },
    { href: "/connections", label: "Connections" },
    { href: "/billing", label: "Billing & credits" },
  ];

  return (
    <header className="flex items-center gap-3">
      <Link href="/" className="flex items-center gap-3">
        <div className="grid size-10 place-items-center rounded-xl bg-boss-violet/15 text-lg font-black text-boss-gold ring-1 ring-white/10">
          M
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight tracking-tight">
            Marketing<span className="text-boss-gold">Boss</span> AI
          </h1>
          <p className="text-[11px] text-white/45">Cinematic marketing creative on demand</p>
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
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pl-1 pr-2.5 text-sm transition hover:bg-white/10"
          >
            <span className="grid size-7 place-items-center rounded-full bg-boss-violet text-xs font-bold text-white">
              {initial}
            </span>
            <span className="hidden max-w-[160px] truncate text-white/80 sm:inline">{email}</span>
            <span className="text-[10px] text-white/40">▼</span>
          </button>

          {open && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-white/10 bg-ink-2 shadow-2xl"
            >
              <div className="border-b border-white/10 px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-white/35">Signed in</div>
                <div className="truncate text-sm text-white/80">{email}</div>
              </div>
              <nav className="py-1.5">
                {items.map((it) => (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={() => setOpen(false)}
                    className={`block px-4 py-2 text-sm transition ${
                      pathname === it.href
                        ? "bg-white/10 text-white"
                        : "text-white/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {it.label}
                  </Link>
                ))}
              </nav>
              <div className="border-t border-white/10 py-1.5">
                <button
                  onClick={signOut}
                  className="block w-full px-4 py-2 text-left text-sm font-medium text-red-300 transition hover:bg-red-500/10"
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
