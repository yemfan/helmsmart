/**
 * Ask Mark's entry points: every one of them reaches the ONE panel through
 * `lib/ask-mark.ts` — the sidebar button and the shortcut by a typed window
 * event, `/ask` by a redirect the panel recognises on arrival.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.hoisted(() =>
  vi.fn((url: string): never => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

import {
  ASK_MARK_EVENT,
  ASK_MARK_LANDING,
  askMarkRequested,
  askMarkShortcutLabel,
  isApplePlatform,
  isAskMarkShortcut,
  onAskMarkRequest,
  requestAskMark,
  urlWithoutAskMark,
  type AskMarkAction,
} from "@/lib/ask-mark";
import { DASHBOARD_SEGMENTS } from "@/lib/auth/dashboard-segments";

describe("open / close requests", () => {
  it("delivers open and close from any entry point to the panel's listener", () => {
    const target = new EventTarget();
    const seen: AskMarkAction[] = [];
    const off = onAskMarkRequest((a) => seen.push(a), target);

    requestAskMark("open", target);
    requestAskMark("close", target);
    requestAskMark(undefined, target); // the sidebar button's default is "open"
    off();
    requestAskMark("open", target); // after unsubscribing: not heard

    expect(seen).toEqual(["open", "close", "open"]);
  });

  it("ignores an event with the right name but no action it knows", () => {
    const target = new EventTarget();
    const handler = vi.fn();
    onAskMarkRequest(handler, target);

    target.dispatchEvent(new CustomEvent(ASK_MARK_EVENT, { detail: { action: "explode" } }));
    target.dispatchEvent(new CustomEvent(ASK_MARK_EVENT, { detail: null }));
    target.dispatchEvent(new Event(ASK_MARK_EVENT));

    expect(handler).not.toHaveBeenCalled();
  });

  it("is a harmless no-op where there is no window (server render, node)", () => {
    expect(typeof window).toBe("undefined");
    expect(() => requestAskMark()).not.toThrow();
    expect(() => requestAskMark("open", null)).not.toThrow();
    const off = onAskMarkRequest(() => {}, null);
    expect(() => off()).not.toThrow();
  });
});

describe("the keyboard shortcut", () => {
  const press = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "altKey", boolean>> = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    ...mods,
  });

  it("opens on Ctrl+/ and ⌘/", () => {
    expect(isAskMarkShortcut(press("/", { ctrlKey: true }))).toBe(true);
    expect(isAskMarkShortcut(press("/", { metaKey: true }))).toBe(true);
  });

  it("leaves the browser's own shortcuts and plain typing alone", () => {
    expect(isAskMarkShortcut(press("j", { ctrlKey: true })), "Ctrl+J is Downloads").toBe(false);
    expect(isAskMarkShortcut(press("j", { metaKey: true })), "⌘J is Jump to Selection").toBe(false);
    expect(isAskMarkShortcut(press("k", { ctrlKey: true })), "⌘K is search").toBe(false);
    expect(isAskMarkShortcut(press("-", { ctrlKey: true })), "Ctrl+- is zoom out").toBe(false);
    expect(isAskMarkShortcut(press("/")), "a bare slash is typing").toBe(false);
    expect(isAskMarkShortcut(press("/", { ctrlKey: true, altKey: true }))).toBe(false);
  });

  it("is written the way this reader types it", () => {
    expect(askMarkShortcutLabel(true)).toBe("⌘/");
    expect(askMarkShortcutLabel(false)).toBe("Ctrl+/");
    expect(isApplePlatform({ platform: "MacIntel" })).toBe(true);
    expect(isApplePlatform({ platform: "", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" })).toBe(true);
    expect(isApplePlatform({ platform: "Win32" })).toBe(false);
    expect(isApplePlatform(undefined)).toBe(false);
  });
});

describe("/ask", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it("redirects to the dashboard with the Ask Mark panel open", async () => {
    const { default: AskPage } = await import("@/app/(dashboard)/ask/page");
    expect(() => AskPage()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/home?ask=1");
    expect(ASK_MARK_LANDING).toBe("/home?ask=1");
    // …and the panel recognises where it landed.
    expect(askMarkRequested(new URL(ASK_MARK_LANDING, "http://localhost").search)).toBe(true);
  });

  it("still sends a signed-out visitor to /login first", () => {
    // proxy.ts decides auth by DASHBOARD_SEGMENTS; the segment has to stay listed.
    // (The list is checked against the whole route tree in
    // lib/auth/dashboard-segments.test.ts; this only pins /ask's own guard.)
    expect(DASHBOARD_SEGMENTS).toContain("/ask");
  });
});

describe("the ?ask param", () => {
  it("opens the panel only when it asks to", () => {
    expect(askMarkRequested("?ask=1")).toBe(true);
    expect(askMarkRequested("?tab=x&ask=1")).toBe(true);
    expect(askMarkRequested("?ask")).toBe(true);
    expect(askMarkRequested("?ask=0")).toBe(false);
    expect(askMarkRequested("?ask=false")).toBe(false);
    expect(askMarkRequested("")).toBe(false);
    expect(askMarkRequested("?tab=ask")).toBe(false);
  });

  it("is taken back out of the address, keeping everything else", () => {
    expect(urlWithoutAskMark("https://www.helmsmart.ai/home?ask=1")).toBe("/home");
    expect(urlWithoutAskMark("/home?ask=1&tab=x#top")).toBe("/home?tab=x#top");
    expect(urlWithoutAskMark("/clients?q=ask")).toBeNull();
    expect(urlWithoutAskMark("/home")).toBeNull();
  });
});
