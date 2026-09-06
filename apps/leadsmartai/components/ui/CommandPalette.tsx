"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useNavCommands, type NavCommand } from "@/components/ui/useNavCommands";

type ContactHit = { id: string; name: string; email: string | null; phone: string | null };

/** One selectable row, whatever it opens. */
type Row =
  | { key: string; section: "pages" | "actions"; label: string; sub?: string; path: string }
  | { key: string; section: "contacts"; label: string; sub?: string; path: string }
  | { key: string; section: "askMax"; label: string; path: string };

/**
 * ⌘K palette — pages, every teammate's actions, your contacts, and a way to
 * hand anything else to Max. Type "grace" and the list shows Grace Bennett;
 * type "cma" and it shows the CMA page under Sales Assistant; type a question
 * and the last row asks Max.
 */
export function CommandPalette() {
  const { t } = useTranslation("dashboard");
  // Derived from the sidebar config + team actions — see useNavCommands.
  const COMMANDS = useNavCommands();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [contacts, setContacts] = useState<ContactHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Cmd+K / Ctrl+K to open
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Sidebar ⌘K trigger row dispatches this event so callers can open the
  // palette without a keyboard. Pair with `PremiumSidebarV2.onSearchClick`.
  useEffect(() => {
    function openHandler() {
      setOpen(true);
    }
    window.addEventListener("open-command-palette", openHandler);
    return () => window.removeEventListener("open-command-palette", openHandler);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      setContacts([]);
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Contacts: debounced, two characters or more, latest query wins.
  useEffect(() => {
    const q = search.trim();
    if (!open || q.length < 2) {
      setContacts([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const id = setTimeout(() => {
      fetch(`/api/dashboard/contacts/search?q=${encodeURIComponent(q)}&limit=5`)
        .then((r) => r.json())
        .then((b: { ok?: boolean; contacts?: ContactHit[] }) => {
          if (!cancelled) setContacts(b?.ok ? (b.contacts ?? []).slice(0, 5) : []);
        })
        .catch(() => {
          if (!cancelled) setContacts([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [open, search]);

  const rows = useMemo<Row[]>(() => {
    const q = search.trim().toLowerCase();
    const match = (c: NavCommand) => !q || c.label.toLowerCase().includes(q) || c.keywords.includes(q);
    const pages: Row[] = COMMANDS.filter((c) => c.kind === "page" && match(c)).map((c) => ({
      key: `p:${c.path}`,
      section: "pages",
      label: c.label,
      path: c.path,
    }));
    const actions: Row[] = COMMANDS.filter((c) => c.kind === "action" && match(c)).map((c) => ({
      key: `a:${c.path}`,
      section: "actions",
      label: c.label,
      sub: c.group,
      path: c.path,
    }));
    const people: Row[] = contacts.map((c) => ({
      key: `c:${c.id}`,
      section: "contacts",
      label: c.name,
      sub: [c.phone, c.email].filter(Boolean).join(" · ") || undefined,
      path: `/dashboard/leads/${encodeURIComponent(c.id)}`,
    }));
    const ask: Row[] = q
      ? [{ key: "ask", section: "askMax", label: t("pages.commandPalette.askMax", { query: search.trim() }), path: `/dashboard/boss?ask=${encodeURIComponent(search.trim())}` }]
      : [];
    // With no query: pages first (the common case is "go somewhere"). With
    // one: people first — a name is the most specific thing you can type.
    return q ? [...people, ...pages, ...actions, ...ask] : [...pages, ...actions];
  }, [COMMANDS, contacts, search, t]);

  useEffect(() => {
    setSelectedIdx((i) => Math.min(i, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && rows[selectedIdx]) {
      go(rows[selectedIdx].path);
    }
  }

  if (!open) return null;

  const sectionTitle: Record<Row["section"], string> = {
    pages: t("pages.commandPalette.sections.pages"),
    actions: t("pages.commandPalette.sections.actions"),
    contacts: t("pages.commandPalette.sections.contacts"),
    askMax: t("pages.commandPalette.sections.askMax"),
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("pages.commandPalette.searchPlaceholder")}
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-700">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder={t("pages.commandPalette.searchPlaceholder")}
            aria-label={t("pages.commandPalette.searchPlaceholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={rows[selectedIdx] ? `cp-${rows[selectedIdx].key}` : undefined}
            className="flex-1 text-sm bg-transparent outline-none placeholder-slate-400 text-slate-900 dark:text-slate-100"
          />
          {searching && <span className="text-[10px] text-slate-400">{t("pages.commandPalette.searching")}</span>}
          <kbd className="hidden sm:inline-block text-[10px] text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>
        <div id="command-palette-list" role="listbox" className="max-h-[360px] overflow-y-auto py-2">
          {rows.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">{t("pages.commandPalette.noMatches")}</p>
          ) : (
            rows.map((row, i) => {
              const first = i === 0 || rows[i - 1].section !== row.section;
              return (
                <div key={row.key}>
                  {first && (
                    <p className="px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      {sectionTitle[row.section]}
                    </p>
                  )}
                  <button
                    id={`cp-${row.key}`}
                    role="option"
                    aria-selected={i === selectedIdx}
                    onClick={() => go(row.path)}
                    onMouseEnter={() => setSelectedIdx(i)}
                    className={`w-full text-left px-4 py-2 text-sm flex items-baseline gap-2 ${
                      i === selectedIdx ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <span className="font-medium">{row.label}</span>
                    {"sub" in row && row.sub ? <span className="truncate text-xs text-slate-400">{row.sub}</span> : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
        <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-2 flex flex-wrap gap-4 text-[10px] text-slate-400">
          <span><kbd className="border border-slate-200 dark:border-slate-700 rounded px-1">↑↓</kbd> {t("pages.commandPalette.navigate")}</span>
          <span><kbd className="border border-slate-200 dark:border-slate-700 rounded px-1">↵</kbd> {t("pages.commandPalette.open")}</span>
          <span><kbd className="border border-slate-200 dark:border-slate-700 rounded px-1">Esc</kbd> {t("pages.commandPalette.close")}</span>
          <span className="ml-auto"><kbd className="border border-slate-200 dark:border-slate-700 rounded px-1">?</kbd> {t("pages.commandPalette.shortcuts")}</span>
        </div>
      </div>
    </div>
  );
}
