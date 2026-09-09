"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { LogoMark } from "@helm/ui";

/**
 * HelmSmart AI — a floating, draggable/resizable assistant panel.
 * Two kinds of tabs:
 *   • "AI Guide" — free-form business chat (streams from /api/ask).
 *   • per-client SMS tabs — search a client, draft an SMS with Claude, see the
 *     thread, send via Twilio, and toggle per-client Auto Pilot (auto-reply to
 *     inbound SMS, handled in the Twilio webhook).
 * Adapted from the LeadSmart AI assistant; rewired to smbai's clients + Claude.
 */

type GuideMessage = { role: "user" | "assistant"; content: string };

type ThreadMessage = {
  id: string;
  message: string;
  direction: "inbound" | "outbound";
  created_at: string;
  twilio_status?: string | null;
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
  autoPilot: boolean;
  thread: ThreadMessage[];
  threadLoading: boolean;
  message: string | null;
  errorMessage: string | null;
  errorMoreInfo?: string | null;
};

/** Keys under `aiPanel.quickPrompts` — the question is translated at render. */
const QUICK_PROMPT_KEYS = ["overdue", "cashFlow", "topClients", "focus"];

function newContactTab(): ContactTab {
  return {
    tabId: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    contact: null,
    prompt: "",
    draft: "",
    drafting: false,
    sending: false,
    autoPilot: false,
    thread: [],
    threadLoading: false,
    message: null,
    errorMessage: null,
  };
}

const STATUS_FAILURE = new Set(["failed", "undelivered", "blocked", "rejected"]);
const STATUS_PROVISIONAL = new Set(["queued", "accepted", "scheduled", "sending", "sent"]);
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
  return c.name?.trim() || c.email?.trim() || c.phone?.trim() || t("aiPanel.contact.fallbackName");
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
  productName = "HelmSmart",
  logoLetter = "H",
}: {
  /** Pack-driven branding so the assistant matches the active vertical (e.g. "DoctorSmart AI"). */
  productName?: string;
  logoLetter?: string;
} = {}) {
  const { t } = useTranslation("home");
  const [open, setOpen] = useState(false);

  const [activeTabId, setActiveTabId] = useState<string>("guide");
  const [contactTabs, setContactTabs] = useState<ContactTab[]>([]);

  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [dragging, setDragging] = useState(false);

  const [size, setSize] = useState<PanelSize | null>(null);
  const [resizing, setResizing] = useState(false);

  const [minimized, setMinimized] = useState(false);

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

  // ── AI Guide (free-form chat) state ─────────────────────────────
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
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });
        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
          throw new Error(errText || t("aiPanel.requestFailed"));
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setGuideMessages((prev) => {
            const next = prev.slice();
            next[next.length - 1] = { role: "assistant", content: acc };
            return next;
          });
        }
        if (!acc.trim()) {
          setGuideMessages((prev) => {
            const next = prev.slice();
            next[next.length - 1] = { role: "assistant", content: t("aiPanel.noResponse") };
            return next;
          });
        }
      } catch (e) {
        const msg = e instanceof Error && e.message ? e.message : t("aiPanel.networkError");
        setGuideMessages((prev) => {
          const next = prev.slice();
          next[next.length - 1] = { role: "assistant", content: msg };
          return next;
        });
      } finally {
        setGuideLoading(false);
      }
    },
    [guideMessages, guideLoading, t],
  );

  // ── Contact tab helpers ─────────────────────────────────────────
  const updateTab = useCallback((tabId: string, patch: Partial<ContactTab>) => {
    setContactTabs((prev) => prev.map((t) => (t.tabId === tabId ? { ...t, ...patch } : t)));
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
      updateTab(tabId, { threadLoading: true });
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
          updateTab(tabId, { threadLoading: false, errorMessage: body.error ?? t("aiPanel.threadLoadFailed") });
        }
      } catch {
        updateTab(tabId, { threadLoading: false, errorMessage: t("aiPanel.threadNetworkError") });
      }
    },
    [updateTab, t],
  );

  const onPickContact = useCallback(
    async (tabId: string, contact: ContactOption) => {
      updateTab(tabId, { contact, draft: "", message: null, errorMessage: null });
      await loadThread(tabId, contact.id);
    },
    [loadThread, updateTab],
  );

  const generateDraft = useCallback(
    async (tab: ContactTab) => {
      if (!tab.contact || !tab.prompt.trim()) return;
      updateTab(tab.tabId, { drafting: true, message: null, errorMessage: null });
      try {
        const res = await fetch("/api/sms/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: tab.contact.id, prompt: tab.prompt.trim() }),
        });
        const body = await res.json();
        if (!body.ok) throw new Error(body.error ?? t("aiPanel.draftFailed"));
        updateTab(tab.tabId, { draft: String(body.draft ?? ""), drafting: false });
      } catch (e) {
        console.error("AI panel: draft SMS", e);
        updateTab(tab.tabId, {
          drafting: false,
          errorMessage: t("aiPanel.draftFailed"),
        });
      }
    },
    [updateTab, t],
  );

  const sendDraft = useCallback(
    async (tab: ContactTab) => {
      if (!tab.contact || !tab.draft.trim() || !tab.contact.phone) return;
      updateTab(tab.tabId, { sending: true, message: null, errorMessage: null });
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
        const body = await res.json();
        if (!body.success) {
          updateTab(tab.tabId, {
            sending: false,
            errorMessage: body.error ?? t("aiPanel.sendFailed"),
          });
          return;
        }
        updateTab(tab.tabId, { sending: false, draft: "", prompt: "", message: t("aiPanel.sent"), errorMoreInfo: null });
        await loadThread(tab.tabId, tab.contact.id);
      } catch (e) {
        console.error("AI panel: send SMS", e);
        updateTab(tab.tabId, {
          sending: false,
          errorMessage: t("aiPanel.sendFailed"),
        });
      }
    },
    [loadThread, updateTab, t],
  );

  const toggleAutoPilot = useCallback(
    async (tab: ContactTab, next: boolean) => {
      if (!tab.contact) return;
      updateTab(tab.tabId, { autoPilot: next, message: null, errorMessage: null });
      try {
        const res = await fetch("/api/sms/auto-pilot", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientId: tab.contact.id, enabled: next }),
        });
        const body = await res.json();
        if (!body.ok) throw new Error(body.error ?? t("aiPanel.toggleFailed"));
      } catch (e) {
        console.error("AI panel: toggle auto-pilot", e);
        updateTab(tab.tabId, {
          autoPilot: !next,
          errorMessage: t("aiPanel.toggleFailed"),
        });
      }
    },
    [updateTab, t],
  );

  // After draft generation, if Auto Pilot is on, send immediately.
  const lastAutoSentRef = useRef<string>("");
  useEffect(() => {
    if (!open) return;
    for (const t of contactTabs) {
      if (
        t.autoPilot &&
        t.draft.trim() &&
        !t.drafting &&
        !t.sending &&
        t.contact?.phone &&
        lastAutoSentRef.current !== `${t.tabId}:${t.draft}`
      ) {
        lastAutoSentRef.current = `${t.tabId}:${t.draft}`;
        void sendDraft(t);
      }
    }
  }, [contactTabs, open, sendDraft]);

  // ── Floating button (closed state) ──────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-[#0B1D33] shadow-lg ring-1 ring-blue-400/30 transition-transform hover:scale-105 hover:ring-blue-300/50"
        aria-label={t("aiPanel.open", { product: productName })}
      >
        <LogoMark letter={logoLetter} color="#fff" size={40} />
      </button>
    );
  }

  const activeContactTab = contactTabs.find((t) => t.tabId === activeTabId) ?? null;

  const positionedClass = position ? "" : "bottom-6 right-6";
  const sizeStyle: React.CSSProperties = size
    ? { width: size.width, height: minimized ? "auto" : size.height, maxHeight: "92vh" }
    : { width: PANEL_DEFAULT_WIDTH, height: minimized ? "auto" : PANEL_DEFAULT_HEIGHT, maxHeight: "92vh" };
  const positionedStyle: React.CSSProperties = {
    ...sizeStyle,
    ...(position ? { top: position.y, left: position.x, bottom: "auto", right: "auto" } : {}),
  };

  return (
    <div
      className={`fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ${positionedClass} ${dragging || resizing ? "select-none" : ""}`}
      style={positionedStyle}
    >
      {/* Header — also the drag handle. */}
      <div
        onPointerDown={onHeaderPointerDown}
        onDoubleClick={resetPosition}
        title={t("aiPanel.dragHint")}
        className={`flex items-center justify-between gap-3 bg-[#1E88E5] px-4 py-3 text-white touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 ring-1 ring-white/40">
            <LogoMark letter={logoLetter} size={28} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{t("aiPanel.title", { product: productName })}</p>
            <p className="truncate text-[11px] opacity-80">{t("aiPanel.subtitle")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setMinimized((v) => !v)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/10 hover:text-white"
            aria-label={
              minimized
                ? t("aiPanel.expand", { product: productName })
                : t("aiPanel.minimize", { product: productName })
            }
            title={minimized ? t("aiPanel.expandShort") : t("aiPanel.minimizeShort")}
          >
            {minimized ? (
              <span aria-hidden className="block h-2.5 w-2.5 rounded-sm border border-white" />
            ) : (
              <span aria-hidden className="block h-px w-3.5 bg-white" />
            )}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-xl leading-none text-white/80 hover:bg-white/10 hover:text-white"
            aria-label={t("aiPanel.close", { product: productName })}
          >
            &times;
          </button>
        </div>
      </div>

      {!minimized ? (
        <>
          <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1">
            <TabPill label={t("aiPanel.guideTab")} active={activeTabId === "guide"} onClick={() => setActiveTabId("guide")} closeLabel={t("aiPanel.closeTab")} />
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
              productName={productName}
              messages={guideMessages}
              loading={guideLoading}
              input={guideInput}
              setInput={setGuideInput}
              send={sendGuide}
              scrollRef={guideScrollRef}
              quickPrompts={QUICK_PROMPT_KEYS.map((k) => t(`aiPanel.quickPrompts.${k}`))}
            />
          ) : activeContactTab ? (
            <ContactTabBody
              tab={activeContactTab}
              updateTab={updateTab}
              generateDraft={generateDraft}
              sendDraft={sendDraft}
              toggleAutoPilot={toggleAutoPilot}
              onPickContact={onPickContact}
            />
          ) : (
            <div className="flex-1 p-4 text-sm text-gray-500">{t("aiPanel.tabNotFound")}</div>
          )}

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

// ── Guide tab body ────────────────────────────────────────────────
function GuideTabBody({
  productName,
  messages,
  loading,
  input,
  setInput,
  send,
  scrollRef,
  quickPrompts,
}: {
  productName: string;
  messages: GuideMessage[];
  loading: boolean;
  input: string;
  setInput: (v: string) => void;
  send: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Already-translated questions. */
  quickPrompts: string[];
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
        {messages.map((m, i) =>
          m.role === "assistant" && m.content === "" ? null : (
            <div
              key={i}
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
          ),
        )}
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
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          placeholder={t("aiPanel.askPlaceholder", { product: productName })}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
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
  toggleAutoPilot,
  onPickContact,
}: {
  tab: ContactTab;
  updateTab: (tabId: string, patch: Partial<ContactTab>) => void;
  generateDraft: (tab: ContactTab) => void;
  sendDraft: (tab: ContactTab) => void;
  toggleAutoPilot: (tab: ContactTab, next: boolean) => void;
  onPickContact: (tabId: string, contact: ContactOption) => void;
}) {
  const { t } = useTranslation("home");
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [tab.thread]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-gray-100 px-3 py-3">
        {tab.contact ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{contactLabel(tab.contact, t)}</p>
              <p className="truncate text-[11px] text-gray-500">
                {tab.contact.phone || t("aiPanel.contact.noPhone")}
                {tab.contact.email ? ` · ${tab.contact.email}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AutoPilotSwitch checked={tab.autoPilot} onChange={(v) => toggleAutoPilot(tab, v)} />
              <button
                type="button"
                onClick={() => updateTab(tab.tabId, { contact: null, draft: "", thread: [] })}
                className="text-xs text-gray-400 hover:text-gray-700"
                title={t("aiPanel.contact.changeTitle")}
              >
                {t("aiPanel.contact.change")}
              </button>
            </div>
          </div>
        ) : (
          <ContactPicker onPick={(c) => onPickContact(tab.tabId, c)} />
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 min-h-0">
        {tab.contact ? (
          <>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                {t("aiPanel.prompt.label")}
              </label>
              <textarea
                value={tab.prompt}
                onChange={(e) => updateTab(tab.tabId, { prompt: e.target.value })}
                rows={2}
                placeholder={t("aiPanel.prompt.placeholder")}
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => generateDraft(tab)}
                disabled={tab.drafting || !tab.prompt.trim()}
                className="mt-1 rounded-lg bg-[#1E88E5] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1872c9] disabled:opacity-50"
              >
                {tab.drafting ? t("aiPanel.prompt.drafting") : t("aiPanel.prompt.generate")}
              </button>
            </div>

            {tab.draft ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  {t("aiPanel.draft.label")}
                </label>
                <textarea
                  value={tab.draft}
                  onChange={(e) => updateTab(tab.tabId, { draft: e.target.value })}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
                />
                {!tab.autoPilot ? (
                  <button
                    type="button"
                    onClick={() => sendDraft(tab)}
                    disabled={tab.sending || !tab.contact?.phone}
                    className="mt-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {tab.sending
                      ? t("aiPanel.draft.sending")
                      : tab.contact?.phone
                        ? t("aiPanel.draft.send")
                        : t("aiPanel.draft.noPhone")}
                  </button>
                ) : (
                  <p className="mt-1 text-[11px] text-amber-700">
                    {tab.sending ? t("aiPanel.draft.autoPilotSending") : t("aiPanel.draft.autoPilotWill")}
                  </p>
                )}
              </div>
            ) : null}

            {tab.errorMessage ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800">
                {tab.errorMessage}
              </p>
            ) : null}

            {tab.message ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                {tab.message}
              </p>
            ) : null}

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                {tab.threadLoading ? t("aiPanel.thread.labelLoading") : t("aiPanel.thread.label")}
              </label>
              <div ref={threadRef} className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/60 p-2 max-h-44 overflow-y-auto">
                {tab.thread.length === 0 && !tab.threadLoading && (
                  <p className="px-1 py-2 text-center text-[11px] text-gray-400">{t("aiPanel.thread.empty")}</p>
                )}
                {tab.thread.map((m) => {
                  const badge = m.direction === "outbound" ? statusBadge(m.twilio_status, t) : null;
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
                      {badge ? (
                        <div
                          className={`mt-0.5 flex justify-end pr-0.5 text-[10px] font-medium ${
                            badge.tone === "ok"
                              ? "text-emerald-700"
                              : badge.tone === "error"
                                ? "text-rose-700"
                                : "text-gray-500"
                          }`}
                          title={t("aiPanel.thread.statusTitle", {
                            status: m.twilio_status ?? t("aiPanel.thread.statusUnknown"),
                          })}
                        >
                          {badge.label}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
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
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
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
              <div className="truncate text-[11px] text-gray-500">{c.phone || c.email || c.id}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Auto Pilot switch ─────────────────────────────────────────────
function AutoPilotSwitch({ checked, onChange }: { checked: boolean; onChange: (next: boolean) => void }) {
  const { t } = useTranslation("home");
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
        checked ? "bg-amber-500 text-white" : "bg-gray-200 text-gray-700"
      }`}
      title={t("aiPanel.autoPilot.title")}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span aria-hidden>{checked ? "🛫" : "✈️"}</span>
      <span>{t("aiPanel.autoPilot.label")}</span>
    </label>
  );
}

// ── Lightweight Markdown renderer for AI Guide replies ────────────
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
