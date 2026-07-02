"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type GuideMessage = { role: "user" | "assistant"; content: string };

type ThreadMessage = {
  id: string;
  message: string;
  direction: "inbound" | "outbound";
  created_at: string;
  /** Latest Twilio status (queued | sent | delivered | failed | undelivered | …) — only present on outbound rows. */
  twilio_status?: string | null;
};

/**
 * True when two thread snapshots are equivalent for render purposes — same
 * rows in the same order with the same delivery status. Lets the background
 * poll skip a state write when nothing changed, so it never re-triggers the
 * scroll-to-bottom effect and yanks the agent's scroll position.
 */
function sameThread(a: ThreadMessage[], b: ThreadMessage[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].twilio_status !== b[i].twilio_status) {
      return false;
    }
  }
  return true;
}

type ContactOption = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type ContactTab = {
  /** Tab identity, not contact identity — survives the contact pick. */
  tabId: string;
  contact: ContactOption | null;
  prompt: string;
  draft: string;
  drafting: boolean;
  sending: boolean;
  autoPilot: boolean;
  thread: ThreadMessage[];
  threadLoading: boolean;
  /** Neutral/info banner (e.g. "Sent."). */
  message: string | null;
  /** Distinct error state — rendered red, not the muted blue info banner. */
  errorMessage: string | null;
  /** Twilio docs URL surfaced when a send fails — render as a "details" link in the error pill. */
  errorMoreInfo?: string | null;
};

type Tab = { kind: "guide" } | { kind: "contact"; tab: ContactTab };

const QUICK_PROMPTS = [
  "Who should I follow up with today?",
  "Which leads are going cold?",
  "Summarize my pipeline",
  "What are my priorities this week?",
];

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

function statusBadge(status: string | null | undefined): { label: string; tone: "ok" | "pending" | "error" } | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (STATUS_SUCCESS.has(s)) return { label: "Delivered", tone: "ok" };
  if (STATUS_FAILURE.has(s)) return { label: s === "failed" ? "Failed" : s.charAt(0).toUpperCase() + s.slice(1), tone: "error" };
  if (STATUS_PROVISIONAL.has(s)) return { label: s.charAt(0).toUpperCase() + s.slice(1), tone: "pending" };
  // Unknown status — show raw so debugging stays useful.
  return { label: s, tone: "pending" };
}

function contactLabel(c: ContactOption | null): string {
  if (!c) return "New contact tab";
  return c.name?.trim() || c.email?.trim() || c.phone?.trim() || "Contact";
}

// localStorage key for the panel's last position. Bumped if the
// panel size changes meaningfully so a stale offscreen position
// doesn't survive a redesign.
const PANEL_POSITION_STORAGE_KEY = "leadsmart.ai-panel.position.v1";
const PANEL_SIZE_STORAGE_KEY = "leadsmart.ai-panel.size.v1";
const PANEL_MIN_STORAGE_KEY = "leadsmart.ai-panel.minimized.v1";
const PANEL_DEFAULT_WIDTH = 440;
const PANEL_DEFAULT_HEIGHT = 640;
const PANEL_MIN_WIDTH = 320;
const PANEL_MIN_HEIGHT = 320;
const PANEL_MAX_WIDTH = 800;
const PANEL_MAX_HEIGHT_LIMIT = 900;
// Kept for backwards compatibility with the existing clampToViewport math.
const PANEL_WIDTH = PANEL_DEFAULT_WIDTH;
const PANEL_MAX_HEIGHT = PANEL_DEFAULT_HEIGHT;

type PanelSize = { width: number; height: number };

type PanelPosition = { x: number; y: number };

function clampToViewport(p: PanelPosition): PanelPosition {
  if (typeof window === "undefined") return p;
  const maxX = Math.max(0, window.innerWidth - PANEL_WIDTH);
  // Use the panel's likely visible height (capped at PANEL_MAX_HEIGHT)
  // rather than its full max — keeps the drag handle reachable even if
  // a later viewport resize would have stranded it.
  const maxY = Math.max(0, window.innerHeight - 120);
  return {
    x: Math.min(maxX, Math.max(0, p.x)),
    y: Math.min(maxY, Math.max(0, p.y)),
  };
}

export function AiChatPanel() {
  const [open, setOpen] = useState(false);

  // Allow other surfaces (Boss Assistant's "Ask your Boss Assistant…"
  // bar) to open the panel: window.dispatchEvent(new CustomEvent("open-ai-chat")).
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("open-ai-chat", onOpen);
    return () => window.removeEventListener("open-ai-chat", onOpen);
  }, []);

  const [activeTabId, setActiveTabId] = useState<string>("guide");
  const [contactTabs, setContactTabs] = useState<ContactTab[]>([]);

  // Drag/reposition state. `null` = use the default bottom-right
  // anchor (Tailwind classes); a value = explicit top/left positioning.
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [dragging, setDragging] = useState(false);

  // Resize state. `null` = use defaults. Persisted to localStorage.
  const [size, setSize] = useState<PanelSize | null>(null);
  const [resizing, setResizing] = useState(false);

  // Minimize state — when true, hide the body and tab strip; show only
  // the header. Persisted so a minimized panel stays minimized across
  // navigations.
  const [minimized, setMinimized] = useState(false);

  // Hydrate saved position, size, and minimized state once on mount.
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

  // Persist + re-clamp on viewport resize so the panel never strands
  // off-screen if the user shrinks the window.
  useEffect(() => {
    if (!position) return;
    try {
      window.localStorage.setItem(PANEL_POSITION_STORAGE_KEY, JSON.stringify(position));
    } catch {
      // private mode / quota — non-fatal
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

  // Drag handlers — attached to the header. Skips if the user clicked
  // an interactive control (the close button) so X still closes.
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

  // Directional resize — "e" (right edge → width), "s" (bottom edge → height),
  // "se" (corner → both). Pins an explicit top-left anchor first so the panel
  // grows toward the cursor (down/right), like a normal resizable window.
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
      const userMsg: GuideMessage = { role: "user", content: trimmed };
      setGuideMessages((prev) => [...prev, userMsg]);
      setGuideInput("");
      setGuideLoading(true);
      try {
        const res = await fetch("/api/dashboard/ai-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history: guideMessages }),
        });
        const body = await res.json();
        const reply = body.ok ? body.reply : body.error || "Sorry, something went wrong.";
        setGuideMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      } catch {
        setGuideMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Network error. Please try again." },
        ]);
      } finally {
        setGuideLoading(false);
      }
    },
    [guideMessages, guideLoading],
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

  const closeContactTab = useCallback(
    (tabId: string) => {
      setContactTabs((prev) => prev.filter((t) => t.tabId !== tabId));
      setActiveTabId((cur) => (cur === tabId ? "guide" : cur));
    },
    [],
  );

  const loadThread = useCallback(
    async (tabId: string, contactId: string, opts?: { silent?: boolean }) => {
      const silent = opts?.silent ?? false;
      if (!silent) updateTab(tabId, { threadLoading: true });
      try {
        const res = await fetch(
          `/api/dashboard/sms/messages?contactId=${encodeURIComponent(contactId)}`,
        );
        const body = await res.json();
        if (body.ok) {
          const nextThread: ThreadMessage[] = body.messages ?? [];
          const nextAutoPilot = Boolean(body.autoPilot);
          if (silent) {
            // Background poll: only touch state when the thread actually
            // changed, otherwise the scroll-to-bottom effect fires every
            // tick and fights the agent scrolling back through history.
            setContactTabs((prev) =>
              prev.map((t) =>
                t.tabId === tabId &&
                (!sameThread(t.thread, nextThread) || t.autoPilot !== nextAutoPilot)
                  ? { ...t, thread: nextThread, autoPilot: nextAutoPilot }
                  : t,
              ),
            );
          } else {
            updateTab(tabId, {
              thread: nextThread,
              autoPilot: nextAutoPilot,
              threadLoading: false,
            });
          }
        } else if (!silent) {
          updateTab(tabId, { threadLoading: false, errorMessage: body.error ?? "Could not load thread." });
        }
      } catch {
        // Silent polls swallow transient network errors — the visible
        // thread stays as-is rather than flashing an error every 15s.
        if (!silent) {
          updateTab(tabId, { threadLoading: false, errorMessage: "Network error loading thread." });
        }
      }
    },
    [updateTab],
  );

  // Poll the focused contact tab's SMS thread so inbound replies surface on
  // their own. The panel otherwise refreshes only on contact-pick and just
  // after sending, so a reply that lands minutes later never appears until
  // the tab is reopened. Silent (no loading flicker); paused while the panel
  // is closed/minimized or the browser tab is hidden.
  const activeContactId =
    contactTabs.find((t) => t.tabId === activeTabId)?.contact?.id ?? null;
  useEffect(() => {
    if (!open || minimized || !activeContactId) return;
    const tabId = activeTabId;
    const contactId = activeContactId;
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void loadThread(tabId, contactId, { silent: true });
    }, 15000);
    return () => clearInterval(id);
  }, [open, minimized, activeTabId, activeContactId, loadThread]);

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
        const res = await fetch("/api/dashboard/sms/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: tab.contact.id, prompt: tab.prompt.trim() }),
        });
        const body = await res.json();
        if (!body.ok) throw new Error(body.error ?? "Failed");
        updateTab(tab.tabId, { draft: String(body.draft ?? ""), drafting: false });
      } catch (e) {
        updateTab(tab.tabId, {
          drafting: false,
          errorMessage: e instanceof Error ? e.message : "Draft failed.",
        });
      }
    },
    [updateTab],
  );

  const sendDraft = useCallback(
    async (tab: ContactTab) => {
      if (!tab.contact || !tab.draft.trim() || !tab.contact.phone) return;
      updateTab(tab.tabId, { sending: true, message: null, errorMessage: null });
      try {
        const res = await fetch("/api/ai-sms/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leadId: tab.contact.id,
            to: tab.contact.phone,
            body: tab.draft.trim(),
          }),
        });
        const body = await res.json();
        if (!body.success) {
          // Preserve Twilio moreInfo URL if the route returned one so
          // the error pill can render a clickable "details" link.
          updateTab(tab.tabId, {
            sending: false,
            errorMessage: body.error ?? "Send failed.",
            errorMoreInfo: body.twilioMoreInfo ?? null,
          });
          return;
        }
        updateTab(tab.tabId, { sending: false, draft: "", prompt: "", message: "Sent.", errorMoreInfo: null });
        // Refresh thread to pick up the new outbound row, then again after a short
        // delay so a Twilio status callback (queued → sent → delivered/failed) shows up.
        await loadThread(tab.tabId, tab.contact.id);
        const contactIdAtSend = tab.contact.id;
        setTimeout(() => {
          loadThread(tab.tabId, contactIdAtSend);
        }, 4000);
      } catch (e) {
        updateTab(tab.tabId, {
          sending: false,
          errorMessage: e instanceof Error ? e.message : "Send failed.",
          errorMoreInfo: null,
        });
      }
    },
    [loadThread, updateTab],
  );

  const toggleAutoPilot = useCallback(
    async (tab: ContactTab, next: boolean) => {
      if (!tab.contact) return;
      // Optimistic flip; revert on error.
      updateTab(tab.tabId, { autoPilot: next, message: null, errorMessage: null });
      try {
        const res = await fetch("/api/dashboard/sms/auto-pilot", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: tab.contact.id, enabled: next }),
        });
        const body = await res.json();
        if (!body.ok) throw new Error(body.error ?? "Toggle failed");
      } catch (e) {
        updateTab(tab.tabId, {
          autoPilot: !next,
          errorMessage: e instanceof Error ? e.message : "Toggle failed.",
        });
      }
    },
    [updateTab],
  );

  // After draft generation, if Auto Pilot is on, send immediately.
  // Effect approach so the latest draft is in state before the send fires.
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
        className="fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-blue-100 transition-transform hover:scale-105 hover:ring-blue-200"
        aria-label="Open RealtyBoss"
      >
        <img
          src="/ai-assistant-mascot.png"
          alt=""
          aria-hidden
          className="h-14 w-14 object-contain"
        />
      </button>
    );
  }

  const activeContactTab = contactTabs.find((t) => t.tabId === activeTabId) ?? null;

  // When the user has dragged, switch from Tailwind bottom/right anchor
  // to explicit top/left so it stays where they left it.
  const positionedClass = position ? "" : "bottom-6 right-6";
  const sizeStyle: React.CSSProperties = size
    ? { width: size.width, height: minimized ? "auto" : size.height, maxHeight: "92vh" }
    : { width: PANEL_DEFAULT_WIDTH, height: minimized ? "auto" : PANEL_DEFAULT_HEIGHT, maxHeight: "92vh" };
  const positionedStyle: React.CSSProperties = {
    ...sizeStyle,
    ...(position
      ? { top: position.y, left: position.x, bottom: "auto", right: "auto" }
      : {}),
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
        title="Drag to reposition · Double-click to reset position + size"
        className={`flex items-center justify-between gap-3 bg-blue-600 px-4 py-3 text-white touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/95 ring-1 ring-white/40">
            <img src="/ai-assistant-mascot.png" alt="" aria-hidden className="h-8 w-8 object-contain" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">RealtyBoss</p>
            <p className="truncate text-[11px] opacity-80">Guide + per-contact SMS drafting</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setMinimized((v) => !v)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/10 hover:text-white"
            aria-label={minimized ? "Expand RealtyBoss" : "Minimize RealtyBoss"}
            title={minimized ? "Expand" : "Minimize"}
          >
            {/* Render an em-dash for minimize, a small square outline for expand. */}
            {minimized ? (
              <span aria-hidden className="block h-2.5 w-2.5 rounded-sm border border-white" />
            ) : (
              <span aria-hidden className="block h-px w-3.5 bg-white" />
            )}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="inline-flex h-7 w-7 items-center justify-center rounded text-xl leading-none text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close RealtyBoss"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Tab strip + body — hidden when minimized so only the header shows. */}
      {!minimized ? (
        <>
          <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-gray-50 px-2 py-1">
            <TabPill
              label="AI Guide"
              active={activeTabId === "guide"}
              onClick={() => setActiveTabId("guide")}
            />
            {contactTabs.map((t) => (
              <TabPill
                key={t.tabId}
                label={contactLabel(t.contact)}
                active={activeTabId === t.tabId}
                onClick={() => setActiveTabId(t.tabId)}
                onClose={() => closeContactTab(t.tabId)}
                tone={t.autoPilot ? "autopilot" : undefined}
              />
            ))}
            <button
              type="button"
              onClick={openNewContactTab}
              className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-blue-50 hover:text-blue-600"
              aria-label="New contact tab"
              title="New contact tab"
            >
              +
            </button>
          </div>

          {activeTabId === "guide" ? (
            <GuideTabBody
              messages={guideMessages}
              loading={guideLoading}
              input={guideInput}
              setInput={setGuideInput}
              send={sendGuide}
              scrollRef={guideScrollRef}
              quickPrompts={QUICK_PROMPTS}
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
            <div className="flex-1 p-4 text-sm text-gray-500">Tab not found.</div>
          )}

          {/* Resize handles — right edge, bottom edge, and bottom-right corner.
              Faintly visible by default + highlighted on hover with the proper
              resize cursors, so it's discoverable like a normal window. */}
          <div
            onPointerDown={startResize("e")}
            title="Drag to resize width"
            aria-label="Resize width"
            className={`absolute right-0 top-14 bottom-4 w-1.5 cursor-ew-resize touch-none rounded-full transition-colors ${
              resizing ? "bg-blue-400/70" : "bg-gray-200/60 hover:bg-blue-300/70"
            }`}
          />
          <div
            onPointerDown={startResize("s")}
            title="Drag to resize height"
            aria-label="Resize height"
            className={`absolute bottom-0 left-3 right-4 h-1.5 cursor-ns-resize touch-none rounded-full transition-colors ${
              resizing ? "bg-blue-400/70" : "bg-gray-200/60 hover:bg-blue-300/70"
            }`}
          />
          <div
            onPointerDown={startResize("se")}
            title="Drag to resize"
            aria-label="Resize panel"
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
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onClose?: () => void;
  tone?: "autopilot";
}) {
  return (
    <div
      className={`group inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active
          ? tone === "autopilot"
            ? "bg-amber-500 text-white"
            : "bg-blue-600 text-white"
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
          aria-label="Close tab"
          title="Close tab"
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}

// ── Guide tab body ────────────────────────────────────────────────
function GuideTabBody({
  messages,
  loading,
  input,
  setInput,
  send,
  scrollRef,
  quickPrompts,
}: {
  messages: GuideMessage[];
  loading: boolean;
  input: string;
  setInput: (v: string) => void;
  send: (text: string) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  quickPrompts: string[];
}) {
  return (
    <>
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4 min-h-0">
        {messages.length === 0 && !loading && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">Try asking:</p>
            {quickPrompts.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="block w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-left text-sm text-blue-600 transition hover:bg-blue-100"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
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
        ))}
        {loading && (
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
          placeholder="Ask RealtyBoss..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          disabled={loading}
        />
        <button
          onClick={() => send(input)}
          disabled={loading || !input.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send
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
  const threadRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [tab.thread]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Top: contact picker + auto-pilot toggle */}
      <div className="space-y-2 border-b border-gray-100 px-3 py-3">
        {tab.contact ? (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">
                {contactLabel(tab.contact)}
              </p>
              <p className="truncate text-[11px] text-gray-500">
                {tab.contact.phone || "(no phone)"}
                {tab.contact.email ? ` · ${tab.contact.email}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <AutoPilotSwitch
                checked={tab.autoPilot}
                onChange={(v) => toggleAutoPilot(tab, v)}
              />
              <button
                type="button"
                onClick={() => updateTab(tab.tabId, { contact: null, draft: "", thread: [] })}
                className="text-xs text-gray-400 hover:text-gray-700"
                title="Pick a different contact"
              >
                change
              </button>
            </div>
          </div>
        ) : (
          <ContactPicker onPick={(c) => onPickContact(tab.tabId, c)} />
        )}
      </div>

      {/* Middle: prompt + draft + thread */}
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 min-h-0">
        {tab.contact ? (
          <>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                What do you want to say?
              </label>
              <textarea
                value={tab.prompt}
                onChange={(e) => updateTab(tab.tabId, { prompt: e.target.value })}
                rows={2}
                placeholder='e.g. "Confirm tomorrow at 3pm" or "Ask about their financing"'
                className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => generateDraft(tab)}
                disabled={tab.drafting || !tab.prompt.trim()}
                className="mt-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {tab.drafting ? "Drafting..." : "Generate draft"}
              </button>
            </div>

            {tab.draft ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  Draft (editable)
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
                    disabled={tab.sending}
                    className="mt-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {tab.sending ? "Sending..." : "Send SMS"}
                  </button>
                ) : (
                  <p className="mt-1 text-[11px] text-amber-700">
                    {tab.sending ? "Auto Pilot sending…" : "Auto Pilot will send this draft."}
                  </p>
                )}
              </div>
            ) : null}

            {tab.errorMessage ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800">
                {tab.errorMessage}
                {tab.errorMoreInfo ? (
                  <>
                    {" "}
                    <a
                      href={tab.errorMoreInfo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-rose-900"
                    >
                      details
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}

            {tab.message ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-800">
                {tab.message}
              </p>
            ) : null}

            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-gray-500">
                SMS thread {tab.threadLoading ? "(loading…)" : ""}
              </label>
              <div ref={threadRef} className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/60 p-2 max-h-44 overflow-y-auto">
                {tab.thread.length === 0 && !tab.threadLoading && (
                  <p className="px-1 py-2 text-center text-[11px] text-gray-400">
                    No messages yet.
                  </p>
                )}
                {tab.thread.map((m) => {
                  const badge = m.direction === "outbound" ? statusBadge(m.twilio_status) : null;
                  return (
                    <div
                      key={m.id}
                      className={`max-w-[85%] ${m.direction === "outbound" ? "ml-auto" : "mr-auto"}`}
                    >
                      <div
                        className={`rounded-lg px-2.5 py-1.5 text-xs ${
                          m.direction === "outbound"
                            ? badge?.tone === "error"
                              ? "bg-rose-600 text-white"
                              : "bg-blue-600 text-white"
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
                          title={`Twilio status: ${m.twilio_status ?? "unknown"}`}
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
            Pick a contact above to start drafting an SMS.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Contact picker (typeahead) ────────────────────────────────────
function ContactPicker({ onPick }: { onPick: (c: ContactOption) => void }) {
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
        const res = await fetch(`/api/dashboard/contacts/search?q=${encodeURIComponent(q.trim())}`);
        const body = await res.json();
        setResults(Array.isArray(body?.contacts) ? body.contacts : Array.isArray(body?.results) ? body.results : []);
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
        placeholder="Search a contact by name, email, phone…"
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
      />
      {open && q.trim() ? (
        <div className="absolute left-0 right-0 z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {loading && <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No contacts match.</div>
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
              <div className="truncate font-medium text-gray-900">{contactLabel(c)}</div>
              <div className="truncate text-[11px] text-gray-500">
                {c.phone || c.email || c.id}
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ── Auto Pilot switch (small, accessible) ─────────────────────────
function AutoPilotSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold transition ${
        checked ? "bg-amber-500 text-white" : "bg-gray-200 text-gray-700"
      }`}
      title="Auto Pilot — auto-send drafts and auto-reply to inbound SMS for this contact."
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span aria-hidden>{checked ? "🛫" : "✈️"}</span>
      <span>Auto Pilot</span>
    </label>
  );
}

// ── Lightweight Markdown renderer for AI Guide replies ────────────
// The guide replies in Markdown (### headings, **bold**, - bullets). Render the
// common cases inline (no dependency) so users see formatting, not raw symbols.
function renderInline(text: string): React.ReactNode[] {
  // Split on **bold**; odd-indexed segments are the bold captures.
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
