"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent } from "@/components/ui/dialog";

/**
 * Global keyboard shortcuts for the dashboard.
 *
 *   ⌘K / Ctrl+K   command palette (handled in CommandPalette)
 *   g then …      go somewhere: m Ask Max · c Contacts · i Conversations ·
 *                 t Tasks · k Calendar · d Deals · s Settings
 *   ?             this list
 *
 * Nothing fires while the focus is in a field, and modifier chords are left
 * to the browser, so typing "g" into a note never teleports the realtor.
 */
const GO: Record<string, string> = {
  m: "/dashboard",
  c: "/dashboard/contacts",
  i: "/dashboard/inbox",
  t: "/dashboard/tasks",
  k: "/dashboard/calendar",
  d: "/dashboard/transactions",
  s: "/dashboard/settings",
};

const SEQUENCE_MS = 1200;

function inField(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function KeyboardShortcuts() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [help, setHelp] = useState(false);

  useEffect(() => {
    let pendingG = 0;
    function handler(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (inField(e.target)) return;
      const now = Date.now();
      if (pendingG && now - pendingG < SEQUENCE_MS) {
        pendingG = 0;
        const path = GO[e.key.toLowerCase()];
        if (path) {
          e.preventDefault();
          router.push(path);
        }
        return;
      }
      if (e.key === "g" || e.key === "G") {
        pendingG = now;
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelp((v) => !v);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  const rows: Array<[string, string]> = [
    ["⌘K / Ctrl K", t("shortcuts.palette")],
    ["g m", t("shortcuts.askMax")],
    ["g c", t("shortcuts.contacts")],
    ["g i", t("shortcuts.conversations")],
    ["g t", t("shortcuts.tasks")],
    ["g k", t("shortcuts.calendar")],
    ["g d", t("shortcuts.deals")],
    ["g s", t("shortcuts.settings")],
    ["?", t("shortcuts.help")],
  ];

  return (
    <Dialog open={help} onOpenChange={setHelp}>
      <DialogContent aria-label={t("shortcuts.title")} className="max-w-sm">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("shortcuts.title")}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("shortcuts.hint")}</p>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(([keys, label]) => (
            <li key={keys} className="flex items-center justify-between gap-4 py-1.5 text-sm">
              <span className="text-slate-700 dark:text-slate-300">{label}</span>
              <kbd className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
