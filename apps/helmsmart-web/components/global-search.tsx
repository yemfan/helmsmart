"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@leadsmart/i18n";
import { Search, Users, FileText, ArrowRight, MessageSquare, CreditCard, X, FolderOpen, CheckSquare } from "lucide-react";

interface SearchResults {
  clients: { id: string; first_name: string | null; last_name: string | null; company: string | null; email: string | null }[];
  invoices: { id: string; invoice_number: string; status: string; total: number; client_name: string | null }[];
  transactions: { id: string; date: string; name: string; merchant_name: string | null; amount: number }[];
  messages: { id: string; channel: string; body: string; client_name: string | null }[];
  estimates: { id: string; estimate_number: string; status: string; total: number }[];
  projects: { id: string; name: string; status: string; color: string }[];
  tasks: { id: string; title: string; status: string; due_date: string | null }[];
}

const EMPTY: SearchResults = { clients: [], invoices: [], transactions: [], messages: [], estimates: [], projects: [], tasks: [] };

const STATUS_COLOR: Record<string, string> = {
  draft:   "text-slate-500",
  sent:    "text-blue-600",
  paid:    "text-emerald-600",
  overdue: "text-rose-600",
  void:    "text-slate-400",
};

export function GlobalSearch() {
  const { t, i18n } = useTranslation("home");
  const money = new Intl.NumberFormat(intlLocale(i18n.language), {
    style: "currency",
    currency: "USD",
  });
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setResults(EMPTY);
    }
  }, [open]);

  // Debounced search
  const runSearch = useCallback((q: string) => {
    if (q.length < 2) { setResults(EMPTY); return; }
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(q)}&limit=5`)
      .then((r) => r.json())
      .then((data) => { setResults(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  function handleInput(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 280);
  }

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  const hasResults =
    results.clients.length + results.invoices.length +
    results.transactions.length + results.messages.length +
    results.estimates.length + results.projects.length + results.tasks.length > 0;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs transition-colors w-full"
        title={t("search.openTitle")}
      >
        <Search className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="flex-1 text-left">{t("search.trigger")}</span>
        <kbd className="text-[10px] bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-24 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-xl mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder={t("search.placeholder")}
            className="flex-1 text-sm text-slate-800 placeholder-slate-400 outline-none"
          />
          {loading && (
            <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin flex-shrink-0" />
          )}
          <button onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!hasResults && query.length >= 2 && !loading && (
            <div className="py-10 text-center text-sm text-slate-400">{t("search.noResults", { query })}</div>
          )}

          {!hasResults && query.length < 2 && (
            <div className="py-8 text-center text-xs text-slate-400">
              {t("search.typeMore")}
            </div>
          )}

          {/* Clients */}
          {results.clients.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("search.sections.clients")}</span>
              </div>
              {results.clients.map((c) => {
                const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.company || t("search.unnamed");
                return (
                  <button
                    key={c.id}
                    onClick={() => navigate(`/clients/${c.id}`)}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold flex-shrink-0">
                      {name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 text-left min-w-0">
                      <p className="text-sm font-medium text-slate-800">{name}</p>
                      {c.email && <p className="text-xs text-slate-400 truncate">{c.email}</p>}
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                  </button>
                );
              })}
            </div>
          )}

          {/* Invoices */}
          {results.invoices.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("search.sections.invoices")}</span>
              </div>
              {results.invoices.map((inv) => (
                <button
                  key={inv.id}
                  onClick={() => navigate(`/books/invoices/${inv.id}`)}
                  className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 font-mono">{inv.invoice_number}</p>
                      <span className={`text-xs font-medium ${STATUS_COLOR[inv.status] ?? ""}`}>
                        {t(`invoiceStatus.${inv.status}`, { defaultValue: inv.status })}
                      </span>
                    </div>
                    {inv.client_name && <p className="text-xs text-slate-400">{inv.client_name}</p>}
                  </div>
                  <span className="text-sm font-semibold text-slate-700 tabular-nums flex-shrink-0">
                    {money.format(Number(inv.total))}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Transactions */}
          {results.transactions.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("search.sections.transactions")}</span>
              </div>
              {results.transactions.map((tx) => (
                <button
                  key={tx.id}
                  onClick={() => navigate("/books/transactions")}
                  className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{tx.merchant_name ?? tx.name}</p>
                    <p className="text-xs text-slate-400">{tx.date}</p>
                  </div>
                  <span className={`text-sm font-semibold tabular-nums flex-shrink-0 ${tx.amount > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {tx.amount > 0 ? "-" : "+"}{money.format(Math.abs(tx.amount))}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          {results.messages.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("search.sections.messages")}</span>
              </div>
              {results.messages.map((m) => (
                <button
                  key={m.id}
                  onClick={() => navigate("/inbox")}
                  className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 text-left min-w-0">
                    {m.client_name && (
                      <p className="text-xs font-semibold text-slate-600 mb-0.5">{m.client_name}</p>
                    )}
                    <p className="text-sm text-slate-700 truncate">{m.body}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0 uppercase">{m.channel}</span>
                </button>
              ))}
            </div>
          )}

          {/* Estimates */}
          {results.estimates.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("search.sections.estimates")}</span>
              </div>
              {results.estimates.map((e) => (
                <button
                  key={e.id}
                  onClick={() => navigate(`/books/estimates/${e.id}`)}
                  className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-800 font-mono">{e.estimate_number}</p>
                      <span className={`text-xs font-medium ${STATUS_COLOR[e.status] ?? "text-slate-500"}`}>{t(`estimateStatus.${e.status}`, { defaultValue: e.status })}</span>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 tabular-nums flex-shrink-0">{money.format(Number(e.total))}</span>
                </button>
              ))}
            </div>
          )}

          {/* Projects */}
          {results.projects.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("search.sections.projects")}</span>
              </div>
              {results.projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/projects/${p.id}`)}
                  className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
                    <p className="text-xs text-slate-400">{t(`projectStatus.${p.status}`, { defaultValue: p.status })}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Tasks */}
          {results.tasks.length > 0 && (
            <div>
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("search.sections.tasks")}</span>
              </div>
              {results.tasks.map((task) => (
                <button
                  key={task.id}
                  onClick={() => navigate("/tasks")}
                  className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm text-slate-700 truncate">{task.title}</p>
                    <p className="text-xs text-slate-400">{t(`taskStatus.${task.status}`, { defaultValue: task.status })}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-3 bg-slate-50/60">
          <span className="text-[10px] text-slate-400">
            <kbd className="bg-slate-200 px-1 py-0.5 rounded text-[10px] font-mono">↵</kbd> {t("search.navigateHint")}
            {" · "}
            <kbd className="bg-slate-200 px-1 py-0.5 rounded text-[10px] font-mono">Esc</kbd> {t("search.closeHint")}
          </span>
        </div>
      </div>
    </div>
  );
}
