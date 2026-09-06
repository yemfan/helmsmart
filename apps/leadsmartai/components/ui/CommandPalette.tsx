"use client";

import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { useNavCommands } from "@/components/ui/useNavCommands";

export function CommandPalette() {
  const { t } = useTranslation("dashboard");
  // Derived from the sidebar config — see useNavCommands for why.
  const COMMANDS = useNavCommands();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
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
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const filtered = search.trim()
    ? COMMANDS.filter((c) => {
        const s = search.toLowerCase();
        return c.label.toLowerCase().includes(s) || c.keywords.toLowerCase().includes(s);
      })
    : COMMANDS;

  function go(path: string) {
    setOpen(false);
    router.push(path);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIdx]) {
      go(filtered[selectedIdx].path);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setSelectedIdx(0); }}
            onKeyDown={handleKeyDown}
            placeholder={t("pages.commandPalette.searchPlaceholder")}
            className="flex-1 text-sm bg-transparent outline-none placeholder-slate-400"
          />
          <kbd className="hidden sm:inline-block text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>
        <div className="max-h-[320px] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">{t("pages.commandPalette.noMatches")}</p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.path}
                onClick={() => go(cmd.path)}
                onMouseEnter={() => setSelectedIdx(i)}
                className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 ${
                  i === selectedIdx ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="font-medium">{cmd.label}</span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-slate-100 px-4 py-2 flex gap-4 text-[10px] text-slate-400">
          <span><kbd className="border border-slate-200 rounded px-1">↑↓</kbd>{t("pages.commandPalette.navigate")}</span>
          <span><kbd className="border border-slate-200 rounded px-1">↵</kbd>{t("pages.commandPalette.open")}</span>
          <span><kbd className="border border-slate-200 rounded px-1">Esc</kbd>{t("pages.commandPalette.close")}</span>
        </div>
      </div>
    </div>
  );
}
