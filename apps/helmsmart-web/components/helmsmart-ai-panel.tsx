"use client";

import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Avatar } from "@helm/ui";
import { Toggle } from "@/components/ui/toggle";
import { formatPhoneDisplay } from "@/lib/phone-display";
import { isMessageSender, senderLabel } from "@/lib/message-provenance";
import {
  ASK_MARK_KEYSHORTCUTS,
  askMarkRequested,
  isAskMarkShortcut,
  onAskMarkRequest,
  urlWithoutAskMark,
} from "@/lib/ask-mark";
import { useAskMarkShortcutLabel } from "@/components/use-ask-mark-shortcut";
import { usePendingApprovals } from "@/components/use-pending-approvals";
import { ApprovalCard } from "@/components/approval-card";
import { announceApprovalsChanged } from "@/lib/approval-events";
import { createAskEventParser, historyForModel, type AskEvent } from "@/lib/ai-team/ask-stream";
import type { ApprovalView } from "@/lib/ai-team/approval-view";

/**
 * Ask Mark — the one place the owner talks to the AI team. Mark, the AI COO,
 * is its face. A floating panel (draggable + resizable on desktop, a
 * full-screen sheet below `md`) with two kinds of tabs:
 *   • "Ask" — Mark, from the business's live data (streams from /api/ask).
 *     He answers, and he routes work to the AI team: a task is added at
 *     once, and anything that would reach a customer (a text, a payment
 *     reminder) comes back as an approval card — Approve / Decline — under
 *     his answer. Nothing leaves the business without that click.
 *   • per-client SMS tabs — search a client, draft an SMS with Claude, see the
 *     thread, and send it to the recipient the button names.
 *
 * One panel, several ways in: its launcher, the sidebar's "Ask Mark" button,
 * Ctrl+/ (⌘/), and `/ask` → `/home?ask=1` — all through `lib/ask-mark.ts`.
 *
 * Auto Pilot (per client) makes the inbound SMS webhook reply to that client's
 * texts by itself. It is turned on only through a confirmation that says
 * exactly that, and the switch shows what `clients.auto_pilot` holds — never
 * a state the write didn't reach. It does NOT send drafts written here: a
 * draft always goes out through the Send button, to the person it names.
 * Adapted from the LeadSmart AI assistant; rewired to smbai's clients + Claude.
 */

type GuideMessage = {
  role: "user" | "assistant";
  content: string;
  /** What the team lined up in this answer, each waiting on (or decided by) the owner. */
  proposals?: ApprovalView[];
};

type ThreadMessage = {
  id: string;
  message: string;
  direction: "inbound" | "outbound";
  created_at: string;
  twilio_status?: string | null;
  /** Who sent an outbound text (`messages.sent_by`), when the endpoint reports it. */
  sent_by?: string | null;
};

type ContactOption = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type ContactTab = {
  tabId: string;
  contact: ContactOption | null;
  prompt: string;
  draft: string;
  drafting: boolean;
  sending: boolean;
  /** The send button reads "Sent!" for a moment after a send succeeds. */
  justSent: boolean;
  /** What `clients.auto_pilot` holds, as last confirmed by the server. */
  autoPilot: boolean;
  autoPilotPending: boolean;
  /** The "turn on Auto Pilot?" explanation is open. */
  confirmingAutoPilot: boolean;
  thread: ThreadMessage[];
  threadLoading: boolean;
  threadError: string | null;
  draftError: string | null;
  sendError: string | null;
  autoPilotError: string | null;
};

/**
 * Keys under `aiPanel.quickPrompts` — the question is translated at render.
 * Each is one the live snapshot in /api/ask can actually answer.
 */
const QUICK_PROMPT_KEYS = ["overdue", "cashFlow", "topExpenses", "activeClients"];

/** How long the send button says "Sent!" before returning to its resting label. */
const SENT_LABEL_MS = 2500;

/** Tailwind's `md` is 48rem; below it the panel is a full-screen sheet. */
const SHEET_QUERY = "(max-width: 767.98px)";

function newContactTab(): ContactTab {
  return {
    tabId: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    contact: null,
    prompt: "",
    draft: "",
    drafting: false,
    sending: false,
    justSent: false,
    autoPilot: false,
    autoPilotPending: false,
    confirmingAutoPilot: false,
    thread: [],
    threadLoading: false,
    threadError: null,
    draftError: null,
    sendError: null,
    autoPilotError: null,
  };
}

const STATUS_FAILURE = new Set(["failed", "undelivered", "blocked", "rejected"]);
const STATUS_SUCCESS = new Set(["delivered", "received"]);

/**
 * The delivery state of one outbound SMS, as the OWNER reads it. Twilio's own
 * status string is the wire value and stays in source; the badge beside the
 * bubble is copy, so it resolves through `aiPanel.smsStatus.*` with the raw
 * status as its own fallback for a state Twilio adds later.
 */
function statusBadge(
  status: string | null | undefined,
  t: TFunction<"home">,
): { label: string; tone: "ok" | "pending" | "error" } | null {
  if (!status) return null;
  const s = status.toLowerCase();
  const label = t(`aiPanel.smsStatus.${s}`, { defaultValue: s });
  if (STATUS_SUCCESS.has(s)) return { label, tone: "ok" };
  if (STATUS_FAILURE.has(s)) return { label, tone: "error" };
  return { label, tone: "pending" };
}

function contactLabel(c: ContactOption | null, t: TFunction<"home">): string {
  if (!c) return t("aiPanel.contact.newTab");
  return (
    c.name?.trim() ||
    c.email?.trim() ||
    formatPhoneDisplay(c.phone) ||
    t("aiPanel.contact.fallbackName")
  );
}

/** True below `md`. Starts false so the server render and first paint agree. */
function useIsSheet(): boolean {
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(SHEET_QUERY);
    const sync = () => setSheet(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return sheet;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Still in the document, laid out, and not hidden (e.g. inside a closed drawer). */
function isOnScreen(el: HTMLElement): boolean {
  return el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
}

const PANEL_POSITION_STORAGE_KEY = "helmsmart.ai-panel.position.v1";
const PANEL_SIZE_STORAGE_KEY = "helmsmart.ai-panel.size.v1";
const PANEL_MIN_STORAGE_KEY = "helmsmart.ai-panel.minimized.v1";
const PANEL_DEFAULT_WIDTH = 440;
const PANEL_DEFAULT_HEIGHT = 640;
const PANEL_MIN_WIDTH = 320;
const PANEL_MIN_HEIGHT = 320;
const PANEL_MAX_WIDTH = 800;
const PANEL_MAX_HEIGHT_LIMIT = 900;
const PANEL_WIDTH = PANEL_DEFAULT_WIDTH;

type PanelSize = { width: number; height: number };
type PanelPosition = { x: number; y: number };

function clampToViewport(p: PanelPosition): PanelPosition {
  if (typeof window === "undefined") return p;
  const maxX = Math.max(0, window.innerWidth - PANEL_WIDTH);
  const maxY = Math.max(0, window.innerHeight - 120);
  return {
    x: Math.min(maxX, Math.max(0, p.x)),
    y: Math.min(maxY, Math.max(0, p.y)),
  };
}

export function HelmSmartAiPanel({
  markAvatar,
  pendingApprovals = 0,
}: {
  /** Mark's avatar id — the business's pick, else his roster default (`lib/mark-avatar.ts`). */
  markAvatar: string;
  /** AI-team proposals waiting on the owner (counted on the launcher). */
  pendingApprovals?: number;
}) {
  const { t } = useTranslation("home");
  const router = useRouter();
  const pendingCount = usePendingApprovals(pendingApprovals);
  const [open, setOpen] = useState(false);
  const sheet = useIsSheet();
  const shortcut = useAskMarkShortcutLabel();
  const searchParams = useSearchParams();

  const [activeTabId, setActiveTabId] = useState<string>("guide");
  const [contactTabs, setContactTabs] = useState<ContactTab[]>([]);

  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [dragging, setDragging] = useState(false);

  const [size, setSize] = useState<PanelSize | null>(null);
  const [resizing, setResizing] = useState(false);

  const [minimized, setMinimized] = useState(false);

  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);
  const titleId = useId();
  const askInputRef = useRef<HTMLInputElement>(null);
  /** What had focus when the panel opened, to hand focus back to on close. */
  const openerRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  /**
   * Every way in except the launcher lands here — the sidebar button, the
   * shortcut, `/ask`: open (and un-minimize) on the Ask view, with the cursor
   * in the question box.
   */
  const openAsk = useCallback(() => {
    if (!openRef.current) {
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    }
    setActiveTabId("guide");
    setMinimized(false);
    setOpen(true);
    // Already open, so the focus effect below won't run again.
    if (openRef.current) requestAnimationFrame(() => askInputRef.current?.focus());
  }, []);

  // The sidebar button asks through a typed window event (`lib/ask-mark.ts`).
  useEffect(
    () => onAskMarkRequest((action) => (action === "open" ? openAsk() : setOpen(false))),
    [openAsk],
  );

  // Ctrl+/ (⌘/ on a Mac), from anywhere in the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isAskMarkShortcut(e)) return;
      e.preventDefault();
      openAsk();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openAsk]);

  // `/ask` redirects to `/home?ask=1`: open, then take the param back out of
  // the address so a reload doesn't reopen the panel.
  useEffect(() => {
    if (!askMarkRequested(searchParams?.toString() ?? "")) return;
    openAsk();
    const cleaned = urlWithoutAskMark(window.location.href);
    if (cleaned !== null) window.history.replaceState(null, "", cleaned);
  }, [searchParams, openAsk]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawPos = window.localStorage.getItem(PANEL_POSITION_STORAGE_KEY);
      if (rawPos) {
        const parsed = JSON.parse(rawPos) as PanelPosition;
        if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
          setPosition(clampToViewport(parsed));
        }
      }
    } catch {
      // ignore stale / malformed values
    }
    try {
      const rawSize = window.localStorage.getItem(PANEL_SIZE_STORAGE_KEY);
      if (rawSize) {
        const parsed = JSON.parse(rawSize) as PanelSize;
        if (typeof parsed?.width === "number" && typeof parsed?.height === "number") {
          setSize({
            width: Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, parsed.width)),
            height: Math.min(PANEL_MAX_HEIGHT_LIMIT, Math.max(PANEL_MIN_HEIGHT, parsed.height)),
          });
        }
      }
    } catch {
      // ignore
    }
    try {
      const rawMin = window.localStorage.getItem(PANEL_MIN_STORAGE_KEY);
      if (rawMin === "1") setMinimized(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!position) return;
    try {
      window.localStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch {
      // non-fatal
    }
  }, [position]);

  useEffect(() => {
    if (!size) return;
    try {
      window.localStorage.setItem(PANEL_SIZE_STORAGE_KEY, JSON.stringify(size));
    } catch {
      // non-fatal
    }
  }, [size]);

  useEffect(() => {
    try {
      if (minimized) window.localStorage.setItem(PANEL_MIN_STORAGE_KEY, "1");
      else window.localStorage.removeItem(PANEL_MIN_STORAGE_KEY);
    } catch {
      // non-fatal
    }
  }, [minimized]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onResize() {
      setPosition((cur) => (cur ? clampToViewport(cur) : cur));
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Focus: into the panel when it opens — the sheet itself on a phone (so a
  // screen reader announces it and Tab starts inside, without raising the
  // keyboard), the question box on a desktop — and, when it closes, back to
  // whatever opened it if that is still on screen, else to the launcher.
  useEffect(() => {
    if (open) {
      wasOpenRef.current = true;
      if (sheet) panelRef.current?.focus();
      else (askInputRef.current ?? panelRef.current)?.focus();
    } else if (wasOpenRef.current) {
      wasOpenRef.current = false;
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener && isOnScreen(opener)) opener.focus();
      else launcherRef.current?.focus();
    }
  }, [open, sheet]);

  // The sheet covers the page; the page behind it must not scroll under a finger.
  useEffect(() => {
    if (!open || !sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, sheet]);

  /** On the sheet: Escape closes it and Tab stays inside it. */
  const onPanelKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!sheet) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === root)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [sheet],
  );

  const onHeaderPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const headerEl = e.currentTarget;
    const panelEl = headerEl.parentElement as HTMLElement | null;
    if (!panelEl) return;
    const rect = panelEl.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    setDragging(true);
    headerEl.setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      setPosition(clampToViewport({ x: ev.clientX - offsetX, y: ev.clientY - offsetY }));
    };
    const onUp = (ev: PointerEvent) => {
      setDragging(false);
      headerEl.releasePointerCapture?.(ev.pointerId);
      headerEl.removeEventListener("pointermove", onMove);
      headerEl.removeEventListener("pointerup", onUp);
      headerEl.removeEventListener("pointercancel", onUp);
    };
    headerEl.addEventListener("pointermove", onMove);
    headerEl.addEventListener("pointerup", onUp);
    headerEl.addEventListener("pointercancel", onUp);
  }, []);

  const resetPosition = useCallback(() => {
    setPosition(null);
    setSize(null);
    try {
      window.localStorage.removeItem(PANEL_POSITION_STORAGE_KEY);
      window.localStorage.removeItem(PANEL_SIZE_STORAGE_KEY);
    } catch {
      // non-fatal
    }
  }, []);

  const startResize = useCallback(
    (dir: "e" | "s" | "se") => (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      const handleEl = e.currentTarget;
      const panelEl = handleEl.parentElement as HTMLElement | null;
      if (!panelEl) return;
      const rect = panelEl.getBoundingClientRect();
      setPosition({ x: rect.left, y: rect.top });
      const startW = rect.width;
      const startH = rect.height;
      setResizing(true);
      handleEl.setPointerCapture?.(e.pointerId);

      const onMove = (ev: PointerEvent) => {
        const w =
          dir === "s"
            ? startW
            : Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, ev.clientX - rect.left));
        const h =
          dir === "e"
            ? startH
            : Math.min(PANEL_MAX_HEIGHT_LIMIT, Math.max(PANEL_MIN_HEIGHT, ev.clientY - rect.top));
        setSize({ width: w, height: h });
      };
      const onUp = (ev: PointerEvent) => {
        setResizing(false);
        handleEl.releasePointerCapture?.(ev.pointerId);
        handleEl.removeEventListener("pointermove", onMove);
        handleEl.removeEventListener("pointerup", onUp);
        handleEl.removeEventListener("pointercancel", onUp);
      };
      handleEl.addEventListener("pointermove", onMove);
      handleEl.addEventListener("pointerup", onUp);
      handleEl.addEventListener("pointercancel", onUp);
    },
    [],
  );

  // ── Ask (Mark answers) state ────────────────────────────────────
  const [guideMessages, setGuideMessages] = useState<GuideMessage[]>([]);
  const [guideInput, setGuideInput] = useState("");
  const [guideLoading, setGuideLoading] = useState(false);
  const guideScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && activeTabId === "guide" && guideScrollRef.current) {
      guideScrollRef.current.scrollTop = guideScrollRef.current.scrollHeight;
    }
  }, [guideMessages, open, activeTabId]);

  const sendGuide = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || guideLoading) return;
      const history: GuideMessage[] = [...guideMessages, { role: "user", content: trimmed }];
      // Show the user message + an empty assistant bubble we stream into.
      setGuideMessages([...history, { role: "assistant", content: "" }]);
      setGuideInput("");
      setGuideLoading(true);
      const setLast = (message: GuideMessage) =>
        setGuideMessages((prev) => {
          const next = prev.slice();
          next[next.length - 1] = message;
          return next;
        });
      let acc = "";
      const proposals: ApprovalView[] = [];
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: historyForModel(history) }),
        });
        if (!res.ok || !res.body) {
          // /api/ask writes its refusals for the owner, in their language.
          const errText = await res.text().catch(() => "");
          throw new Error(errText || t("aiPanel.requestFailed"));
        }
        // One JSON event per line: Mark's words as he writes them, and each
        // proposal as the card to show under them.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createAskEventParser();
        const apply = (events: AskEvent[]) => {
          if (events.length === 0) return;
          for (const e of events) {
            if (e.t === "text") acc += e.v;
            else if (e.t === "error") acc += `${acc.trim() ? "\n\n" : ""}${e.v}`;
            else {
              proposals.push(e.approval);
              announceApprovalsChanged(1);
            }
          }
          setLast({ role: "assistant", content: acc, proposals: proposals.slice() });
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          apply(parser.push(decoder.decode(value, { stream: true })));
        }
        apply(parser.flush());
        if (!acc.trim() && proposals.length === 0) setLast({ role: "assistant", content: t("aiPanel.noResponse") });
        // The new proposals belong on /home's "Needs your approval" too.
        if (proposals.length > 0) router.refresh();
      } catch (e) {
        const msg = e instanceof Error && e.message ? e.message : t("aiPanel.networkError");
        setLast({ role: "assistant", content: acc.trim() ? `${acc}\n\n${msg}` : msg, proposals: proposals.slice() });
      } finally {
        setGuideLoading(false);
      }
    },
    [guideMessages, guideLoading, t, router],
  );

  /** A card under one of Mark's answers was decided: keep the conversation's copy in step. */
  const onProposalDecided = useCallback((view: ApprovalView) => {
    setGuideMessages((prev) =>
      prev.map((m) =>
        m.proposals?.some((p) => p.id === view.id)
          ? { ...m, proposals: m.proposals.map((p) => (p.id === view.id ? view : p)) }
          : m,
      ),
    );
  }, []);

  // ── Contact tab helpers ─────────────────────────────────────────
  const updateTab = useCallback((tabId: string, patch: Partial<ContactTab>) => {
    setContactTabs((prev) => prev.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t)));
  }, []);

  const sentTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const timers = sentTimers.current;
    return () => timers.forEach((h) => clearTimeout(h));
  }, []);

  const openNewContactTab = useCallback(() => {
    const t = newContactTab();
    setContactTabs((prev) => [...prev, t]);
    setActiveTabId(t.tabId);
  }, []);

  const closeContactTab = useCallback((tabId: string) => {
    setContactTabs((prev) => prev.filter((t) => t.tabId !== tabId));
    setActiveTabId((cur) => (cur === tabId ? "guide" : cur));
  }, []);

  const loadThread = useCallback(
    async (tabId: string, contactId: string) => {
      updateTab(tabId, { threadLoading: true, threadError: null });
      try {
        const res = await fetch(`/api/sms/messages?clientId=${encodeURIComponent(contactId)}`);
        const body = await res.json();
        if (body.ok) {
          updateTab(tabId, {
            thread: body.messages ?? [],
            autoPilot: Boolean(body.autoPilot),
            threadLoading: false,
          });
        } else {
          updateTab(tabId, { threadLoading: false, threadError: t("aiPanel.threadLoadFailed") });
        }
      } catch {
        updateTab(tabId, { threadLoading: false, threadError: t("aiPanel.threadNetworkError") });
      }
    },
    [updateTab, t],
  );

  const onPickContact = useCallback(
    async (tabId: string, contact: ContactOption) => {
      updateTab(tabId, {
        contact,
        draft: "",
        justSent: false,
        confirmingAutoPilot: false,
        draftError: null,
        sendError: null,
        autoPilotError: null,
      });
      await loadThread(tabId, contact.id);
    },
    [loadThread, updateTab],
  );

  const generateDraft = useCallback(
    async (tab: ContactTab) => {
      if (!tab.contact || !tab.prompt.trim()) return;
      updateTab(tab.tabId, { drafting: true, draftError: null });
      try {
        const res = await fetch("/api/sms/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: tab.contact.id, prompt: tab.prompt.trim() }),
        });
        const body = await res.json().catch(() => null);
        if (body?.ok) {
          updateTab(tab.tabId, { draft: String(body.draft ?? ""), drafting: false, justSent: false });
          return;
        }
        // A refusal (4xx) carries a reason written for the owner — the contact
        // opted out, say. A 5xx carries the model provider's error, which isn't
        // written for anyone, so that case gets our own sentence.
        const reason =
          res.status >= 400 && res.status < 500 && typeof body?.error === "string" && body.error.trim()
            ? body.error.trim()
            : t("aiPanel.draftFailed");
        updateTab(tab.tabId, { drafting: false, draftError: reason });
      } catch (e) {
        console.error("AI panel: draft SMS", e);
        updateTab(tab.tabId, { drafting: false, draftError: t("aiPanel.draftFailed") });
      }
    },
    [updateTab, t],
  );

  const sendDraft = useCallback(
    async (tab: ContactTab) => {
      if (!tab.contact || !tab.draft.trim() || !tab.contact.phone) return;
      updateTab(tab.tabId, { sending: true, sendError: null, justSent: false });
      try {
        const res = await fetch("/api/sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: tab.contact.id,
            to: tab.contact.phone,
            body: tab.draft.trim(),
          }),
        });
        const body = await res.json().catch(() => null);
        if (!body?.success) {
          // Shown as the endpoint wrote it: /api/sms/* returns the reason for
          // the owner to read ("Priya opted out of texts on Sep 3"), and that
          // reason is more useful than any sentence this panel could guess.
          const reason =
            typeof body?.error === "string" && body.error.trim() ? body.error.trim() : t("aiPanel.sendFailed");
          updateTab(tab.tabId, { sending: false, sendError: reason });
          return;
        }
        updateTab(tab.tabId, { sending: false, justSent: true, draft: "", prompt: "" });
        const prev = sentTimers.current.get(tab.tabId);
        if (prev) clearTimeout(prev);
        sentTimers.current.set(
          tab.tabId,
          setTimeout(() => {
            sentTimers.current.delete(tab.tabId);
            updateTab(tab.tabId, { justSent: false });
          }, SENT_LABEL_MS),
        );
        await loadThread(tab.tabId, tab.contact.id);
      } catch (e) {
        console.error("AI panel: send SMS", e);
        updateTab(tab.tabId, { sending: false, sendError: t("aiPanel.sendFailed") });
      }
    },
    [loadThread, updateTab, t],
  );

  /** What the database holds for this client's Auto Pilot, or null if unreadable. */
  const readAutoPilot = useCallback(async (contactId: string): Promise<boolean | null> => {
    try {
      const res = await fetch(`/api/sms/messages?clientId=${encodeURIComponent(contactId)}`);
      const body = await res.json();
      return body?.ok ? Boolean(body.autoPilot) : null;
    } catch {
      return null;
    }
  }, []);

  /**
   * Write Auto Pilot and show only what landed. The switch moves when the
   * server confirms a row changed; on anything else it shows what the database
   * holds (re-read, since a dropped connection can hide a write that did land)
   * and says why.
   */
  const writeAutoPilot = useCallback(
    async (tab: ContactTab, next: boolean) => {
      if (!tab.contact) return;
      const contact = tab.contact;
      updateTab(tab.tabId, { autoPilotPending: true, confirmingAutoPilot: false, autoPilotError: null });
      let ok = false;
      try {
        const res = await fetch("/api/sms/auto-pilot", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: contact.id, enabled: next }),
        });
        const body = await res.json().catch(() => null);
        ok = res.ok && body?.ok === true;
      } catch (e) {
        console.error("AI panel: auto-pilot write", e);
      }
      if (ok) {
        updateTab(tab.tabId, { autoPilot: next, autoPilotPending: false });
        return;
      }
      const holds = (await readAutoPilot(contact.id)) ?? !next;
      updateTab(tab.tabId, {
        autoPilot: holds,
        autoPilotPending: false,
        autoPilotError:
          holds === next
            ? null
            : t(next ? "aiPanel.autoPilot.enableFailed" : "aiPanel.autoPilot.disableFailed", {
                name: contactLabel(contact, t),
              }),
      });
    },
    [readAutoPilot, updateTab, t],
  );

  /** Turning on asks first; turning off doesn't need to. */
  const requestAutoPilot = useCallback(
    (tab: ContactTab, next: boolean) => {
      if (next) updateTab(tab.tabId, { confirmingAutoPilot: true, autoPilotError: null });
      else void writeAutoPilot(tab, false);
    },
    [updateTab, writeAutoPilot],
  );

  // ── Floating button (closed state) ──────────────────────────────
  if (!open) {
    return (
      <button
        ref={launcherRef}
        onClick={() => setOpen(true)}
        className="fixed right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-[#0B1D33] shadow-lg ring-1 ring-blue-400/30 transition-transform hover:scale-105 hover:ring-blue-300/50"
        style={{ bottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
        aria-label={pendingCount > 0 ? t("aiPanel.openWithApprovals", { count: pendingCount }) : t("aiPanel.open")}
        aria-keyshortcuts={ASK_MARK_KEYSHORTCUTS}
        title={t("aiPanel.openHint", { shortcut })}
      >
        <Avatar id={markAvatar} size={52} />
        {pendingCount > 0 ? (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1 text-[11px] font-bold leading-none text-slate-900 ring-2 ring-white"
          >
            {pendingCount > 99 ? "99+" : pendingCount}
          </span>
        ) : null}
      </button>
    );
  }

  const activeContactTab = contactTabs.find((t) => t.tabId === activeTabId) ?? null;
  // The sheet has no minimized state: it is either the whole screen or closed.
  const isMinimized = minimized && !sheet;

  const positionedClass = position ? "" : "bottom-6 right-6";
  const sizeStyle: React.CSSProperties = size
    ? { width: size.width, height: isMinimized ? "auto" : size.height, maxHeight: "92vh" }
    : { width: PANEL_DEFAULT_WIDTH, height: isMinimized ? "auto" : PANEL_DEFAULT_HEIGHT, maxHeight: "92vh" };
  const panelStyle: React.CSSProperties = sheet
    ? {
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }
    : {
        ...sizeStyle,
        ...(position ? { top: position.y, left: position.x, bottom: "auto", right: "auto" } : {}),
      };

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal={sheet ? true : undefined}
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      className={`fixed z-50 flex flex-col overflow-hidden bg-white focus:outline-none ${
        sheet ? "inset-0" : `rounded-2xl border border-gray-200 shadow-2xl ${positionedClass}`
      } ${dragging || resizing ? "select-none" : ""}`}
      style={panelStyle}
    >
      {/* Header — the drag handle on desktop; on the sheet it only holds the title and Close. */}
      <div
        onPointerDown={sheet ? undefined : onHeaderPointerDown}
        onDoubleClick={sheet ? undefined : resetPosition}
        title={sheet ? undefined : t("aiPanel.dragHint")}
        className={`flex items-center justify-between gap-3 bg-[#1E88E5] px-4 py-3 text-white ${
          sheet ? "" : `touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`
        }`}
        style={sheet ? { paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" } : undefined}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-full bg-white/95 ring-2 ring-white/40">
            <Avatar id={markAvatar} size={36} />
          </span>
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-bold">
              {t("aiPanel.title")}
            </p>
            <p className="text-[11px] leading-snug opacity-90">
              {t("aiPanel.subtitle")}{" "}
              {/* Mark is a captain, and the owner can see who he captains.
                  `stopPropagation` keeps the header's drag from eating the click. */}
              <Link
                href="/ai-team"
                onPointerDown={(e) => e.stopPropagation()}
                className="underline underline-offset-2 hover:opacity-100"
              >
                {t("aiPanel.meetTheTeam")}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {sheet ? null : (
            <button
              onClick={() => setMinimized((v) => !v)}
              className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/10 hover:text-white"
              aria-label={minimized ? t("aiPanel.expand") : t("aiPanel.minimize")}
              title={minimized ? t("aiPanel.expandShort") : t("aiPanel.minimizeShort")}
            >
              {minimized ? (
                <span aria-hidden className="block h-2.5 w-2.5 rounded-sm border border-white" />
              ) : (
                <span aria-hidden className="block h-px w-3.5 bg-white" />
              )}
            </button>
          )}
          <button
            onClick={() => setOpen(false)}
            className={`inline-flex items-center justify-center rounded leading-none text-white/80 hover:bg-white/10 hover:text-white ${
              sheet ? "h-11 w-11 text-3xl" : "h-7 w-7 text-xl"
            }`}
            aria-label={t("aiPanel.close")}
          >
            &times;
          </button>
        </div>
      </div>

      {!isMinimized ? (
        <>
          <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1">
            <TabPill label={t("aiPanel.askTab")} active={activeTabId === "guide"} onClick={() => setActiveTabId("guide")} closeLabel={t("aiPanel.closeTab")} />
            {contactTabs.map((tab) => (
              <TabPill
                key={tab.tabId}
                label={contactLabel(tab.contact, t)}
                active={activeTabId === tab.tabId}
                onClick={() => setActiveTabId(tab.tabId)}
                onClose={() => closeContactTab(tab.tabId)}
                closeLabel={t("aiPanel.closeTab")}
                tone={tab.autoPilot ? "autopilot" : undefined}
              />
            ))}
            <button
              type="button"
              onClick={openNewContactTab}
              className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-blue-50 hover:text-[#1E88E5]"
              aria-label={t("aiPanel.newContactTab")}
              title={t("aiPanel.newContactTab")}
            >
              +
            </button>
          </div>

          {activeTabId === "guide" ? (
            <GuideTabBody
              inputRef={askInputRef}
              messages={guideMessages}
              loading={guideLoading}
              input={guideInput}
              setInput={setGuideInput}
              send={sendGuide}
              scrollRef={guideScrollRef}
              quickPrompts={QUICK_PROMPT_KEYS.map((k) => t(`aiPanel.quickPrompts.${k}`))}
              onProposalDecided={onProposalDecided}
            />
          ) : activeContactTab ? (
            <ContactTabBody
              tab={activeContactTab}
              updateTab={updateTab}
              generateDraft={generateDraft}
              sendDraft={sendDraft}
              requestAutoPilot={requestAutoPilot}
              confirmAutoPilot={(tab) => void writeAutoPilot(tab, true)}
              onPickContact={onPickContact}
            />
          ) : (
            <div className="flex-1 p-4 text-sm text-gray-500">{t("aiPanel.tabNotFound")}</div>
          )}

          {sheet ? null : (
            <>
              <div
                onPointerDown={startResize("e")}
                title={t("aiPanel.resizeWidthHint")}
                aria-label={t("aiPanel.resizeWidth")}
                className={`absolute right-0 top-14 bottom-4 w-1.5 cursor-ew-resize touch-none rounded-full transition-colors ${
                  resizing ? "bg-blue-400/70" : "bg-gray-200/60 hover:bg-blue-300/70"
                }`}
              />
              <div
                onPointerDown={startResize("s")}
                title={t("aiPanel.resizeHeightHint")}
                aria-label={t("aiPanel.resizeHeight")}
                className={`absolute bottom-0 left-3 right-4 h-1.5 cursor-ns-resize touch-none rounded-full transition-colors ${
                  resizing ? "bg-blue-400/70" : "bg-gray-200/60 hover:bg-blue-300/70"
                }`}
              />
              <div
                onPointerDown={startResize("se")}
                title={t("aiPanel.resizeHint")}
                aria-label={t("aiPanel.resizePanel")}
                className={`absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none ${
                  resizing ? "bg-blue-200/50" : "hover:bg-blue-200/40"
                }`}
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, transparent 0 45%, rgba(100,116,139,0.55) 45% 55%, transparent 55% 65%, rgba(100,116,139,0.55) 65% 75%, transparent 75% 85%, rgba(100,116,139,0.55) 85% 95%, transparent 95%)",
                }}
              />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Tab pill ──────────────────────────────────────────────────────
function TabPill({
  label,
  active,
  onClick,
  onClose,
  closeLabel,
  tone,
}: {
  /** Already translated by the caller. */
  label: string;
  active: boolean;
  onClick: () => void;
  onClose?: () => void;
  /** Already-translated label for the close control. */
  closeLabel: string;
  tone?: "autopilot";
}) {
  return (
    <div
      className={`group inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active
          ? tone === "autopilot"
            ? "bg-amber-500 text-white"
            : "bg-[#1E88E5] text-white"
          : tone === "autopilot"
            ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
            : "bg-white text-gray-700 hover:bg-gray-100"
      }`}
    >
      <button type="button" onClick={onClick} className="max-w-[140px] truncate">
        {tone === "autopilot" ? "🛫 " : ""}
        {label}
      </button>
      {onClose ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[11px] leading-none ${
            active ? "text-white/80 hover:bg-white/20" : "text-gray-400 hover:bg-gray-200"
          }`}
          aria-label={closeLabel}
          title={closeLabel}
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}

// ── Ask tab body (Mark answers) ───────────────────────────────────
function GuideTabBody({
  inputRef,
  messages,
  loading,
  input,
  setInput,
  send,
  scrollRef,
  quickPrompts,
  onProposalDecided,
}: {
  /** The question box — the Ask Mark entry points put the cursor here. */
  inputRef: React.RefObject<HTMLInputElement | null>;
  messages: GuideMessage[];
  loading: boolean;
  input: string;
  setInput: (v: string) => void;
  send: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Already-translated questions. */
  quickPrompts: string[];
  onProposalDecided: (view: ApprovalView) => void;
}) {
  const { t } = useTranslation("home");
  // The last assistant bubble may be an empty placeholder while a stream
  // is still warming up — show the typing dots until text arrives.
  const lastIsEmptyAssistant =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    messages[messages.length - 1].content === "";

  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">{t("aiPanel.tryAsking")}</p>
            {quickPrompts.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="block w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-left text-sm text-[#1E88E5] transition hover:bg-blue-100"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <Fragment key={i}>
            {m.role === "assistant" && m.content === "" ? null : (
              <div
                className={`text-sm leading-relaxed ${
                  m.role === "user"
                    ? "ml-8 rounded-xl rounded-br-sm bg-blue-50 px-3 py-2 text-blue-900"
                    : "mr-8 rounded-xl rounded-bl-sm bg-gray-50 px-3 py-2 text-gray-800"
                }`}
              >
                {m.role === "assistant" ? (
                  <MarkdownLite text={m.content} />
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}
              </div>
            )}
            {/* What the team lined up in this answer — nothing goes until the owner approves it here. */}
            {m.proposals?.length ? (
              <div className="mr-4 space-y-2">
                {m.proposals.map((p) => (
                  <ApprovalCard key={p.id} approval={p} onDecided={onProposalDecided} refreshOnDecide />
                ))}
              </div>
            ) : null}
          </Fragment>
        ))}
        {(loading && lastIsEmptyAssistant) && (
          <div className="mr-8 rounded-xl rounded-bl-sm bg-gray-50 px-3 py-2">
            <div className="flex gap-1">
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "0ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "150ms" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" style={{ animationDelay: "300ms" }} />
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 border-t border-gray-100 px-3 py-3">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={t("aiPanel.askPlaceholder")}
          aria-label={t("aiPanel.askPlaceholder")}
          // 16px below md so iOS doesn't zoom the sheet when the field takes focus.
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-400 focus:outline-none md:text-sm"
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="rounded-lg bg-[#1E88E5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1872c9] disabled:opacity-50"
        >
          {t("aiPanel.send")}
        </button>
      </div>
    </>
  );
}

// ── Contact tab body ──────────────────────────────────────────────
function ContactTabBody({
  tab,
  updateTab,
  generateDraft,
  sendDraft,
  requestAutoPilot,
  confirmAutoPilot,
  onPickContact,
}: {
  tab: ContactTab;
  updateTab: (tabId: string, patch: Partial<ContactTab>) => void;
  generateDraft: (tab: ContactTab) => void;
  sendDraft: (tab: ContactTab) => void;
  requestAutoPilot: (tab: ContactTab, next: boolean) => void;
  confirmAutoPilot: (tab: ContactTab) => void;
  onPickContact: (tabId: string, contact: ContactOption) => void;
}) {
  const { t } = useTranslation("home");
  const threadRef = useRef<HTMLDivElement>(null);
  const promptId = useId();
  const draftId = useId();
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [tab.thread]);

  const name = contactLabel(tab.contact, t);
  const personName = tab.contact?.name?.trim() || "";
  const phone = formatPhoneDisplay(tab.contact?.phone);

  // The send button names who the text goes to — the one thing worth being
  // sure of before a message leaves the business.
  const sendLabel = tab.sending
    ? t("aiPanel.draft.sending")
    : tab.justSent
      ? t("aiPanel.draft.sentBang")
      : !phone
        ? t("aiPanel.draft.noPhone")
        : personName
          ? t("aiPanel.draft.sendTo", { name: personName, phone })
          : t("aiPanel.draft.sendToNumber", { phone });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-gray-100 px-3 py-3">
        {tab.contact ? (
          <>
            <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                <p className="truncate text-[11px] text-gray-500">
                  {phone || t("aiPanel.contact.noPhone")}
                  {tab.contact.email ? ` · ${tab.contact.email}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateTab(tab.tabId, {
                    contact: null,
                    draft: "",
                    thread: [],
                    autoPilot: false,
                    confirmingAutoPilot: false,
                    justSent: false,
                    threadError: null,
                    draftError: null,
                    sendError: null,
                    autoPilotError: null,
                  })
                }
                className="shrink-0 text-xs text-gray-400 hover:text-gray-700"
                title={t("aiPanel.contact.changeTitle")}
              >
                {t("aiPanel.contact.change")}
              </button>
            </div>
            <AutoPilotControl
              tab={tab}
              name={name}
              onToggle={(next) => requestAutoPilot(tab, next)}
              onConfirm={() => confirmAutoPilot(tab)}
              onCancel={() => updateTab(tab.tabId, { confirmingAutoPilot: false })}
            />
          </>
        ) : (
          <ContactPicker onPick={(c) => onPickContact(tab.tabId, c)} />
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 min-h-0">
        {tab.contact ? (
          <>
            <div>
              <label htmlFor={promptId} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                {t("aiPanel.prompt.label")}
              </label>
              <textarea
                id={promptId}
                value={tab.prompt}
                onChange={(e) => updateTab(tab.tabId, { prompt: e.target.value })}
                rows={2}
                placeholder={t("aiPanel.prompt.placeholder")}
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-400 focus:outline-none md:text-sm"
              />
              <button
                type="button"
                onClick={() => generateDraft(tab)}
                disabled={tab.drafting || !tab.prompt.trim()}
                className="mt-1 rounded-lg bg-[#1E88E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1872c9] disabled:opacity-50"
              >
                {tab.drafting ? t("aiPanel.prompt.drafting") : t("aiPanel.prompt.generate")}
              </button>
              {tab.draftError ? (
                <p className="mt-1 text-xs text-rose-600" role="alert">
                  {tab.draftError}
                </p>
              ) : null}
            </div>

            <div>
              <label htmlFor={draftId} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                {t("aiPanel.draft.label")}
              </label>
              <textarea
                id={draftId}
                value={tab.draft}
                onChange={(e) => updateTab(tab.tabId, { draft: e.target.value, justSent: false, sendError: null })}
                rows={3}
                placeholder={t("aiPanel.draft.placeholder")}
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-400 focus:outline-none md:text-sm"
              />
              <button
                type="button"
                onClick={() => sendDraft(tab)}
                disabled={tab.sending || tab.justSent || !phone || !tab.draft.trim()}
                className="mt-1 max-w-full truncate rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {sendLabel}
              </button>
              {tab.sendError ? (
                <p className="mt-1 text-xs text-rose-600" role="alert">
                  {tab.sendError}
                </p>
              ) : null}
            </div>

            <div>
              <p className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                {tab.threadLoading ? t("aiPanel.thread.labelLoading") : t("aiPanel.thread.label")}
              </p>
              <div ref={threadRef} className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/60 p-2 max-h-44 overflow-y-auto">
                {tab.thread.length === 0 && !tab.threadLoading && !tab.threadError && (
                  <p className="px-1 py-2 text-center text-[11px] text-gray-400">{t("aiPanel.thread.empty")}</p>
                )}
                {tab.thread.map((m) => {
                  const badge = m.direction === "outbound" ? statusBadge(m.twilio_status, t) : null;
                  // What sent an outbound text, in the inbox's words (`senderLabel`). A
                  // person's own send — and a row from before `sent_by` — goes unlabelled:
                  // in this panel, that's the default.
                  const sender =
                    m.direction === "outbound" && isMessageSender(m.sent_by) && m.sent_by !== "person"
                      ? senderLabel(m.sent_by, t)
                      : null;
                  return (
                    <div key={m.id} className={`max-w-[85%] ${m.direction === "outbound" ? "ml-auto" : "mr-auto"}`}>
                      <div
                        className={`rounded-lg px-2.5 py-1.5 text-xs ${
                          m.direction === "outbound"
                            ? badge?.tone === "error"
                              ? "bg-rose-600 text-white"
                              : "bg-[#1E88E5] text-white"
                            : "bg-white text-gray-800 ring-1 ring-gray-200"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.message}</div>
                      </div>
                      {badge || sender ? (
                        <div className="mt-0.5 flex justify-end gap-1.5 pr-0.5 text-[10px] font-medium">
                          {sender ? <span className="text-gray-500">{sender}</span> : null}
                          {badge ? (
                            <span
                              className={
                                badge.tone === "ok"
                                  ? "text-emerald-700"
                                  : badge.tone === "error"
                                    ? "text-rose-700"
                                    : "text-gray-500"
                              }
                              title={t("aiPanel.thread.statusTitle", {
                                status: m.twilio_status ?? t("aiPanel.thread.statusUnknown"),
                              })}
                            >
                              {badge.label}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {tab.threadError ? (
                <p className="mt-1 text-xs text-rose-600" role="alert">
                  {tab.threadError}
                </p>
              ) : null}
            </div>
          </>
        ) : (
          <p className="px-2 py-6 text-center text-xs text-gray-400">
            {t("aiPanel.contact.pickFirst")}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Auto Pilot: the house switch, and the explanation before it turns on ──
function AutoPilotControl({
  tab,
  name,
  onToggle,
  onConfirm,
  onCancel,
}: {
  tab: ContactTab;
  /** The contact's display name, already resolved. */
  name: string;
  onToggle: (next: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("home");
  const headingId = useId();
  const switchRef = useRef<HTMLSpanElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (tab.confirmingAutoPilot) confirmRef.current?.focus();
  }, [tab.confirmingAutoPilot]);

  const cancel = () => {
    onCancel();
    // The explanation unmounts; put focus back on the switch that opened it.
    requestAnimationFrame(() => switchRef.current?.querySelector<HTMLElement>('[role="switch"]')?.focus());
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <span ref={switchRef} className="inline-flex">
          <Toggle
            size="sm"
            checked={tab.autoPilot}
            disabled={tab.autoPilotPending || tab.confirmingAutoPilot}
            onChange={onToggle}
            label={t("aiPanel.autoPilot.switchLabel", { name })}
          />
        </span>
        <span className="text-xs font-medium text-gray-700">{t("aiPanel.autoPilot.label")}</span>
      </div>
      {tab.autoPilot && !tab.autoPilotError ? (
        <p className="mt-1 text-[11px] text-gray-500">{t("aiPanel.autoPilot.onHint", { name })}</p>
      ) : null}
      {tab.autoPilotError ? (
        <p className="mt-1 text-xs text-rose-600" role="alert">
          {tab.autoPilotError}
        </p>
      ) : null}
      {tab.confirmingAutoPilot ? (
        <div role="group" aria-labelledby={headingId} className="mt-2 rounded-lg border border-gray-200 bg-white p-3">
          <p id={headingId} className="text-sm font-semibold text-gray-900">
            {t("aiPanel.autoPilot.confirmTitle", { name })}
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-gray-600">
            <li>{t("aiPanel.autoPilot.confirmReplies", { name })}</li>
            <li>{t("aiPanel.autoPilot.confirmLabelled")}</li>
            <li>{t("aiPanel.autoPilot.confirmOptOut")}</li>
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              ref={confirmRef}
              type="button"
              onClick={onConfirm}
              className="rounded-lg bg-[#1E88E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1872c9]"
            >
              {t("aiPanel.autoPilot.confirmTurnOn")}
            </button>
            <button
              type="button"
              onClick={cancel}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Contact picker (typeahead) ────────────────────────────────────
function ContactPicker({ onPick }: { onPick: (c: ContactOption) => void }) {
  const { t } = useTranslation("home");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/clients/search?q=${encodeURIComponent(q.trim())}`);
        const body = await res.json();
        setResults(Array.isArray(body?.contacts) ? body.contacts : []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [q]);

  return (
    <div className="relative">
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t("aiPanel.contact.searchPlaceholder")}
        aria-label={t("aiPanel.contact.searchPlaceholder")}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:border-blue-400 focus:outline-none md:text-sm"
      />
      {open && q.trim() ? (
        <div className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-gray-500">{t("aiPanel.contact.searching")}</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">{t("aiPanel.contact.noMatch")}</div>
          )}
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onPick(c);
                setOpen(false);
                setQ("");
              }}
              className="block w-full border-b border-gray-50 px-3 py-2 text-left text-sm hover:bg-blue-50 last:border-b-0"
            >
              <div className="truncate font-medium text-gray-900">{contactLabel(c, t)}</div>
              <div className="truncate text-[11px] text-gray-500">{formatPhoneDisplay(c.phone) || c.email || c.id}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Lightweight Markdown renderer for Mark's answers ──────────────
function renderInline(text: string): React.ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-gray-900">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function MarkdownLite({ text }: { text: string }) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: React.ReactNode[] = [];
  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul key={key} className="my-1 ml-4 list-disc space-y-0.5">
          {list}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, "");
    if (/^#{1,6}\s+/.test(line)) {
      flushList(`ul-${idx}`);
      blocks.push(
        <p key={idx} className="mb-0.5 mt-2 font-bold text-gray-900">
          {renderInline(line.replace(/^#{1,6}\s+/, ""))}
        </p>,
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      list.push(<li key={idx}>{renderInline(line.replace(/^\s*[-*]\s+/, ""))}</li>);
    } else if (line.trim() === "") {
      flushList(`ul-${idx}`);
    } else {
      flushList(`ul-${idx}`);
      blocks.push(
        <p key={idx} className="my-0.5">
          {renderInline(line)}
        </p>,
      );
    }
  });
  flushList("ul-end");
  return <div className="space-y-0.5">{blocks}</div>;
}
