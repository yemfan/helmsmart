"use client";

import { ChevronDown, CreditCard, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

function cn(...parts: (string | false | undefined | null)[]) {
  return parts.filter(Boolean).join(" ");
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export type ProfileMenuProps = {
  name: string;
  email?: string;
  className?: string;
  /** Profile / account landing — omit to hide row */
  profileHref?: string;
  settingsHref?: string;
  billingHref?: string;
  billingLabel?: string;
  onLogout?: () => void;
};

function MenuLink({
  href,
  className,
  onClick,
  children,
}: {
  href: string;
  className: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  if (isExternal(href)) {
    return (
      <a href={href} className={className} role="menuitem" onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} role="menuitem" onClick={onClick}>
      {children}
    </Link>
  );
}

/**
 * Avatar + name chip with dropdown. Menu is portaled to `document.body` with fixed positioning
 * so parent `overflow-x-auto` / `overflow-hidden` (e.g. top bars) cannot clip it.
 */
export function ProfileMenu({
  name,
  email,
  className = "",
  profileHref,
  settingsHref,
  billingHref,
  billingLabel = "Billing",
  onLogout,
}: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<{ top: number; right: number } | null>(null);

  const updatePlacement = useCallback(() => {
    const el = buttonRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    setPlacement({
      top: r.bottom + 8,
      right: window.innerWidth - r.right,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
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

  const close = () => setOpen(false);

  const menuPanel = (
    <div
      ref={menuRef}
      className="fixed z-[200] w-[min(100vw-2rem,15.5rem)] rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 p-1.5 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/[0.04] dark:ring-slate-100/10"
      role="menu"
      style={
        placement
          ? { top: placement.top, right: placement.right }
          : { visibility: "hidden", pointerEvents: "none" }
      }
    >
      <div className="border-b border-slate-100 dark:border-slate-700 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Signed in</p>
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{name}</p>
        {email ? <p className="truncate text-xs text-slate-500">{email}</p> : null}
      </div>
      <div className="mt-1 space-y-0.5">
        {profileHref ? (
          <MenuLink
            href={profileHref}
            onClick={close}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <User className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
            Profile
          </MenuLink>
        ) : null}
        {settingsHref ? (
          <MenuLink
            href={settingsHref}
            onClick={close}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Settings className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
            Settings
          </MenuLink>
        ) : null}
        {billingHref ? (
          <MenuLink
            href={billingHref}
            onClick={close}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <CreditCard className="h-4 w-4 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
            {billingLabel}
          </MenuLink>
        ) : null}
      </div>
      {onLogout ? (
        <div className="mt-1 border-t border-slate-100 dark:border-slate-700 pt-1">
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
            onClick={() => {
              close();
              onLogout();
            }}
          >
            <LogOut className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className={cn("relative", className)} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-3 rounded-2xl border border-slate-200/90 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-left shadow-sm ring-1 ring-slate-900/[0.03] dark:ring-slate-100/10 transition hover:border-slate-300/90 hover:bg-slate-50/80 dark:hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-sm font-semibold text-white shadow-inner shadow-white/10 ring-2 ring-slate-100">
          {initials(name)}
        </div>
        <div className="hidden min-w-0 text-left leading-tight sm:block">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{name}</div>
          {email ? <div className="max-w-[140px] truncate text-xs text-slate-500">{email}</div> : null}
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
      </button>

      {open && placement && typeof document !== "undefined"
        ? createPortal(menuPanel, document.body)
        : null}
    </div>
  );
}
