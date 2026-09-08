"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/**
 * Unsaved-changes guard for the dashboard.
 *
 * When a form has edits that are not saved, the dashboard does three things:
 * shows an "Unsaved changes" note (the form's own, beside its Save button,
 * and a small pill at the bottom of the screen for forms that have none),
 * asks before an in-app link or a programmatic navigation leaves the page,
 * and asks before the tab is closed or reloaded.
 *
 * Three ways a form takes part, in order of precision:
 *
 *   useUnsavedChanges(dirty)  the form computes dirtiness itself: the hub
 *                             editor compares each draft with its last saved
 *                             value, so a normalised echo from the server is
 *                             not an edit;
 *   a plain <form> element    edits to its fields count until it submits or
 *                             a save request to our API succeeds;
 *   a form route              on settings and create/edit pages (FORM_ROUTES)
 *                             every field edit counts until a save request
 *                             succeeds or the page is left. List pages are
 *                             not on the list, so a filter never asks.
 *
 * Opt a field or a container out with data-unsaved-ignore. The guard says
 * yes or no; it never blocks silently. The browser's own dialog is used for
 * closing the tab (the only one browsers allow) and a confirm() for in-app
 * moves, so the wording is the same on both.
 */

/** Pages whose fields are a form, not a filter. */
const FORM_ROUTES: RegExp[] = [
  /^\/dashboard\/settings(\/|$)/,
  /^\/dashboard\/ai-team(\/|$)/,
  /^\/dashboard\/ai-(receptionist|sales-assistant|marketing-assistant|transaction-assistant|accountant)\/(?!actions)/,
  /^\/dashboard\/transactions\/(new|[^/]+)(\/|$)/,
  /^\/dashboard\/offers(\/|$)/,
  /^\/dashboard\/listing-offers\//,
  /^\/dashboard\/listings\/(upload|[^/]+\/offers\/new)(\/|$)/,
  /^\/dashboard\/showings\/new(\/|$)/,
  /^\/dashboard\/open-houses\/(new|flyer)(\/|$)/,
  /^\/dashboard\/leads\/(add|generate\/(ads\/new|post\/new|connect))(\/|$)/,
  /^\/dashboard\/contacts\/(scan|import-file)(\/|$)/,
  /^\/dashboard\/(cma|house-search|deep-report|presentations|templates|drafts|postcards|missed-call|marketing\/plans)(\/|$)/,
];

type Ctx = {
  setDirty: (id: string, dirty: boolean) => void;
  isDirty: () => boolean;
  /** true = go ahead (nothing dirty, or the person chose to leave). Clears the flags on "leave". */
  confirmLeave: () => boolean;
  dirtyCount: number;
};

const UnsavedCtx = createContext<Ctx | null>(null);

const containerIds = new WeakMap<Element, string>();
let containerSeq = 0;
function containerId(el: Element): string {
  let id = containerIds.get(el);
  if (!id) {
    containerSeq += 1;
    id = `form:${containerSeq}`;
    containerIds.set(el, id);
  }
  return id;
}

/** Requests that mean "this was saved". Beacons and logs are not saves. */
function isSaveRequest(input: RequestInfo | URL, init?: RequestInit): boolean {
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let path: string;
  try {
    const u = new URL(raw, window.location.href);
    if (u.origin !== window.location.origin) return false;
    path = u.pathname;
  } catch {
    return false;
  }
  if (!path.startsWith("/api/")) return false;
  return !/\/(events?|track|beacon|logs?|telemetry|heartbeat|ping|usage)(\/|$)/.test(path);
}

function isEditableField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return false;
  if (el instanceof HTMLInputElement && ["search", "submit", "button", "file", "hidden", "reset"].includes(el.type)) return false;
  if (el.getAttribute("role") === "searchbox" || el.getAttribute("role") === "combobox") return false;
  if (el.closest("[data-unsaved-ignore], header, nav, [role='search'], [role='dialog'][data-unsaved-ignore]")) return false;
  return true;
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("dashboard");
  const pathname = usePathname();
  const dirtyIds = useRef(new Set<string>());
  const [dirtyCount, setDirtyCount] = useState(0);
  const message = t("unsaved.leave", { defaultValue: "You have unsaved changes. Leave without saving?" });
  const messageRef = useRef(message);
  messageRef.current = message;
  const routeTracked = useRef(false);
  routeTracked.current = FORM_ROUTES.some((rx) => rx.test(pathname ?? ""));

  const sync = useCallback(() => setDirtyCount(dirtyIds.current.size), []);
  const setDirty = useCallback(
    (id: string, dirty: boolean) => {
      const s = dirtyIds.current;
      const before = s.size;
      if (dirty) s.add(id);
      else s.delete(id);
      if (s.size !== before) sync();
    },
    [sync],
  );
  const clearAuto = useCallback(() => {
    let changed = false;
    for (const id of [...dirtyIds.current]) {
      if (id.startsWith("form:") || id === "route") {
        dirtyIds.current.delete(id);
        changed = true;
      }
    }
    if (changed) sync();
  }, [sync]);
  const isDirty = useCallback(() => dirtyIds.current.size > 0, []);
  const confirmLeave = useCallback(() => {
    if (dirtyIds.current.size === 0) return true;
    const ok = window.confirm(messageRef.current);
    if (ok) {
      dirtyIds.current.clear();
      sync();
    }
    return ok;
  }, [sync]);

  // A new page starts clean: whatever a previous page's fields had is gone with it.
  useEffect(() => {
    clearAuto();
  }, [pathname, clearAuto]);

  // Closing or reloading the tab, or leaving for another site.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyIds.current.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // In-app links, caught in the capture phase before the router sees the click.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dirtyIds.current.size === 0 || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(a.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return; // beforeunload covers leaving the site
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // a hash on this page
      if (!confirmLeave()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [confirmLeave]);

  // Field edits: inside a <form>, keyed by that form; on a form route, keyed by the route.
  useEffect(() => {
    const onEdit = (e: Event) => {
      const el = e.target;
      if (!isEditableField(el)) return;
      const form = el.form ?? el.closest("form");
      if (form) {
        if (!form.hasAttribute("data-unsaved-managed")) setDirty(containerId(form), true);
        return;
      }
      if (routeTracked.current && el.closest("main")) setDirty("route", true);
    };
    const onSubmit = (e: Event) => {
      const form = e.target;
      if (form instanceof HTMLFormElement) setDirty(containerId(form), false);
    };
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("submit", onSubmit, true);
    };
  }, [setDirty]);

  // A save request to our API that succeeds clears the automatic flags; most
  // forms save from a button, not a submit. Hook-managed forms know for themselves.
  useEffect(() => {
    const original = window.fetch;
    const wrapped: typeof window.fetch = async (input, init) => {
      const res = await original(input, init);
      try {
        if (res.ok && isSaveRequest(input, init)) clearAuto();
      } catch {
        // Never let bookkeeping break a request.
      }
      return res;
    };
    window.fetch = wrapped;
    return () => {
      if (window.fetch === wrapped) window.fetch = original;
    };
  }, [clearAuto]);

  return (
    <UnsavedCtx.Provider value={{ setDirty, isDirty, confirmLeave, dirtyCount }}>
      {children}
      {dirtyCount > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4 print:hidden"
        >
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-md ring-1 ring-inset ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800">
            {t("unsaved.note", { defaultValue: "Unsaved changes" })}
          </span>
        </div>
      ) : null}
    </UnsavedCtx.Provider>
  );
}

/** Tell the dashboard whether this form has edits that are not saved. */
export function useUnsavedChanges(dirty: boolean): void {
  const ctx = useContext(UnsavedCtx);
  const key = `hook:${useId()}`;
  useEffect(() => {
    ctx?.setDirty(key, dirty);
    return () => ctx?.setDirty(key, false);
  }, [ctx, key, dirty]);
}

/** For code that navigates itself (router.push from a button): ask first. */
export function useLeaveGuard(): () => boolean {
  const ctx = useContext(UnsavedCtx);
  return ctx?.confirmLeave ?? (() => true);
}

/** The form's own line: shown while there are edits that are not saved. */
export function UnsavedNote({ dirty, className }: { dirty: boolean; className?: string }) {
  const { t } = useTranslation("dashboard");
  if (!dirty) return null;
  return (
    <span role="status" className={className ?? "text-sm font-medium text-amber-700 dark:text-amber-400"}>
      {t("unsaved.note", { defaultValue: "Unsaved changes" })}
    </span>
  );
}
