"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * Minimal contact autocomplete for forms that need to reference an existing
 * contact (new transaction, task assignment, etc.).
 *
 * Behavior:
 *   - Debounced search against `/api/dashboard/contacts/search?q=...`.
 *   - Arrow keys + Enter + Escape for keyboard nav.
 *   - Clear button resets id + display.
 *   - If `initialContactId` is passed, the component resolves the display
 *     name once on mount via `?id=<uuid>`. This supports deep-links like
 *     `/dashboard/transactions/new?contactId=...`.
 *
 * Intentionally small — this is not a generic typeahead abstraction. If a
 * third surface grows to need it, promote to a shared primitive then.
 */

export type ContactPickerValue = {
  id: string;
  name: string;
};

type PickerRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  propertyAddress: string | null;
};

type Props = {
  value: ContactPickerValue | null;
  onChange: (next: ContactPickerValue | null) => void;
  /** Only used on mount. Component fetches the display name once. */
  initialContactId?: string | null;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Rendered under the input. Keeps layout consistent with surrounding form. */
  helperText?: string;
};

const DEBOUNCE_MS = 180;

export default function ContactPicker({
  value,
  onChange,
  initialContactId,
  placeholder = "Search name, email, or phone…",
  disabled,
  className,
  helperText,
}: Props) {
  const { t } = useTranslation("dashboard");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [resolvedInitial, setResolvedInitial] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  // One-shot resolve of `initialContactId` → display name. Runs once per
  // mount; if the parent later swaps `value`, we don't re-fetch.
  useEffect(() => {
    if (resolvedInitial) return;
    if (!initialContactId) {
      setResolvedInitial(true);
      return;
    }
    if (value?.id === initialContactId) {
      setResolvedInitial(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/contacts/search?id=${encodeURIComponent(initialContactId)}`,
        );
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          contact?: PickerRow | null;
        };
        if (cancelled) return;
        if (body.ok && body.contact) {
          onChange({ id: body.contact.id, name: body.contact.name });
        }
      } finally {
        if (!cancelled) setResolvedInitial(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialContactId]);

  // Debounced search. Skips if a contact is already selected and the user
  // hasn't typed since — avoids clobbering the chosen row as soon as the
  // user refocuses.
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const seq = ++requestSeq.current;
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      try {
        const url = query.trim()
          ? `/api/dashboard/contacts/search?q=${encodeURIComponent(query.trim())}`
          : `/api/dashboard/contacts/search`;
        const res = await fetch(url);
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          contacts?: PickerRow[];
        };
        if (seq !== requestSeq.current) return; // stale
        if (body.ok && Array.isArray(body.contacts)) {
          setResults(body.contacts);
          setHighlight(0);
        }
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  // Close on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function choose(row: PickerRow) {
    onChange({ id: row.id, name: row.name });
    setQuery("");
    setOpen(false);
  }

  function clear() {
    onChange(null);
    setQuery("");
    setResults([]);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      if (open && results[highlight]) {
        e.preventDefault();
        choose(results[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const selected = value;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">{selected.name}</div>
          </div>
          <button
            type="button"
            onClick={clear}
            disabled={disabled}
            className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >{t("pages.misc.change")}</button>
        </div>
      ) : (
        <>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            autoComplete="off"
          />
          {open && (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {loading ? (
                <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>
              ) : results.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-500">
                  {query.trim() ? "No contacts match." : "Type to search — or your most recently contacted show here."}
                </div>
              ) : (
                <ul role="listbox">
                  {results.map((r, i) => (
                    <li
                      key={r.id}
                      role="option"
                      aria-selected={i === highlight}
                      onMouseDown={(e) => {
                        // onMouseDown fires before blur — prevents the
                        // dropdown from closing before the click handler.
                        e.preventDefault();
                        choose(r);
                      }}
                      onMouseEnter={() => setHighlight(i)}
                      className={`cursor-pointer border-b border-slate-50 px-3 py-2 text-sm last:border-b-0 ${
                        i === highlight ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      <div className="font-medium text-slate-900">{r.name}</div>
                      <div className="mt-0.5 flex gap-2 text-[11px] text-slate-500">
                        {r.email ? <span className="truncate">{r.email}</span> : null}
                        {r.phone ? <span>{r.phone}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
      {helperText ? (
        <p className="mt-1 text-[11px] text-slate-500">{helperText}</p>
      ) : null}
    </div>
  );
}
