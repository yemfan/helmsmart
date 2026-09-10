"use client";

import { ChevronDown, CreditCard, Home, LogOut, Package, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useAccess } from "@/components/AccessProvider";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import type { AccessTier } from "@/lib/access";

function tierLabel(tier: string, plan: string | null) {
  if (tier === "premium") return "Premium";
  const p = (plan ?? "free").toLowerCase();
  if (p === "pro") return "Pro";
  return "Free";
}

export default function AccountMenu() {
  const { user, loading: authLoading } = useAuth();
  const { usage, refresh } = useAccess();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  /* Fetch avatar from /api/me (same approach as CloseBoss TopBar) */
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        const res = await fetch("/api/me", {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        const av = json?.avatar_url;
        setAvatarUrl(typeof av === "string" && av.trim() ? av.trim() : null);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function onLogout() {
    setOpen(false);
    try {
      await supabaseBrowser().auth.signOut();
    } catch (e) {
      console.error(e);
    } finally {
      await refresh();
      router.refresh();
      router.push("/");
    }
  }

  if (authLoading) {
    return <div className="h-11 w-[7.5rem] animate-pulse rounded-2xl bg-slate-100/90 sm:w-36" aria-hidden />;
  }

  if (!user) return null;

  const tier: AccessTier = usage?.tier ?? "free";
  const email = (user.email?.trim() || usage?.email?.trim() || "").trim();
  const initial = email ? email[0]!.toUpperCase() : "?";
  const shortEmail = email.length > 22 ? `${email.slice(0, 20)}…` : email;
  const status = usage?.subscriptionStatus ? String(usage.subscriptionStatus) : "";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-11 max-w-[200px] items-center gap-2 rounded-2xl border border-slate-200/90 bg-white px-2 py-1 text-left shadow-sm ring-1 ring-slate-900/[0.03] transition hover:border-slate-300 hover:bg-slate-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 sm:max-w-[240px] sm:gap-2.5 sm:px-2.5"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-xs font-bold text-white shadow-inner shadow-white/10 ring-2 ring-slate-100">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="User profile photo" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <span className="hidden min-w-0 flex-1 sm:block">
          <span className="block truncate text-sm font-semibold text-slate-900">Account</span>
          <span className="block truncate text-xs text-slate-500">{shortEmail || "Signed in"}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      </button>

      {open ? (
        <div
          className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,19rem)] rounded-2xl border border-slate-200/90 bg-white p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/[0.04]"
          role="menu"
        >
          <div className="border-b border-slate-100 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Signed in as</p>
            <p className="mt-1 break-all text-sm font-semibold text-slate-900">{email || "Your account"}</p>
            <p className="mt-1 text-xs text-slate-600">
              {tierLabel(tier, usage?.plan ?? null)}
              {status ? <span className="text-slate-400"> · {status}</span> : null}
            </p>
          </div>
          <div className="mt-1 space-y-0.5">
            <Link
              href="/"
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              <Home className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              Home
            </Link>
            <Link
              href="/account/profile"
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              <User className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              My profile
            </Link>
            <Link
              href="/account/billing"
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              <CreditCard className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              Billing
            </Link>
            <Link
              href="/pricing"
              role="menuitem"
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => setOpen(false)}
            >
              <Package className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
              Plans &amp; pricing
            </Link>
          </div>
          <div className="mt-1 border-t border-slate-100 pt-1">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
              onClick={() => void onLogout()}
            >
              <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
