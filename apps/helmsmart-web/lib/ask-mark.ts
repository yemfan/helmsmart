/**
 * "Ask Mark" — the one place the owner talks to the AI team.
 *
 * Mark (the AI COO) is the captain: the owner asks Mark. There is exactly one
 * panel (`components/helmsmart-ai-panel.tsx`, mounted once by the dashboard
 * layout), and every entry point reaches it through this module instead of
 * owning a copy of it:
 *
 *   • the floating launcher, which is part of the panel itself;
 *   • the sidebar's "Ask Mark" button (desktop column and mobile drawer), which
 *     lives in a different React tree and so sends a typed window event;
 *   • the keyboard shortcut, Ctrl+/ (⌘/ on a Mac);
 *   • `/ask`, which redirects to `/home?ask=1` — the panel opens itself on that
 *     param and then takes it out of the address bar.
 *
 * No directive and no server imports: the panel, the sidebar and the node test
 * suite all import this file.
 */

/** The window event an entry point sends to open or close the panel. */
export const ASK_MARK_EVENT = "helmsmart:ask-mark";

export type AskMarkAction = "open" | "close";

export interface AskMarkDetail {
  action: AskMarkAction;
}

function windowTarget(): EventTarget | null {
  return typeof window === "undefined" ? null : window;
}

/** Ask the panel to open (or close). A no-op where there is no window. */
export function requestAskMark(action: AskMarkAction = "open", target: EventTarget | null = windowTarget()): void {
  target?.dispatchEvent(new CustomEvent<AskMarkDetail>(ASK_MARK_EVENT, { detail: { action } }));
}

/**
 * The panel's side: call `handler` for every well-formed request. Returns the
 * unsubscribe, so it drops straight into a `useEffect`.
 */
export function onAskMarkRequest(
  handler: (action: AskMarkAction) => void,
  target: EventTarget | null = windowTarget(),
): () => void {
  if (!target) return () => {};
  const listener = (e: Event) => {
    const action = (e as CustomEvent<Partial<AskMarkDetail> | null>).detail?.action;
    if (action === "open" || action === "close") handler(action);
  };
  target.addEventListener(ASK_MARK_EVENT, listener);
  return () => target.removeEventListener(ASK_MARK_EVENT, listener);
}

/*
 * The shortcut is Ctrl+/ (⌘/ on a Mac), not the ⌘J an AI shortcut often gets:
 * Ctrl+J opens Downloads in Chrome, Edge and Firefox on Windows and Linux, and
 * ⌘J is Safari's "Jump to Selection". Ctrl+/ has no default in those browsers.
 * Matched on the character, not the physical key, so layouts that type "/"
 * with Shift (Spanish, German) still get it — and so the key that sits where
 * "/" is on a US board (Ctrl+- , zoom out, on a German one) is never taken.
 */
type ShortcutKeys = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey">;

/** True for the keystroke that opens Ask Mark. */
export function isAskMarkShortcut(e: ShortcutKeys): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey && e.key === "/";
}

/** `aria-keyshortcuts` for every control that opens the panel. */
export const ASK_MARK_KEYSHORTCUTS = "Control+/ Meta+/";

/** How the shortcut is written for this reader: "⌘/" on a Mac, "Ctrl+/" elsewhere. */
export function askMarkShortcutLabel(isMac: boolean): string {
  return isMac ? "⌘/" : "Ctrl+/";
}

/** Whether a navigator is an Apple platform (so the shortcut reads with ⌘). */
export function isApplePlatform(nav: { platform?: string; userAgent?: string } | undefined): boolean {
  if (!nav) return false;
  return /Mac|iPhone|iPad|iPod/i.test(nav.platform || nav.userAgent || "");
}

/** The search param that opens the panel on arrival. */
export const ASK_MARK_PARAM = "ask";

/** Where `/ask` lands: the dashboard, with Mark's panel open. */
export const ASK_MARK_LANDING = `/home?${ASK_MARK_PARAM}=1`;

/** Does this query string ask for the panel? `?ask=0` and a missing param do not. */
export function askMarkRequested(search: string): boolean {
  const value = new URLSearchParams(search).get(ASK_MARK_PARAM);
  return value !== null && value !== "0" && value !== "false";
}

/**
 * The same address without `?ask=…`, as a path + query + hash — or null when
 * there was nothing to remove, so the caller leaves history alone.
 */
export function urlWithoutAskMark(href: string): string | null {
  const url = new URL(href, "http://localhost");
  if (!url.searchParams.has(ASK_MARK_PARAM)) return null;
  url.searchParams.delete(ASK_MARK_PARAM);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}
