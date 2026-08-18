"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Wait here" vs "Notify me" for any job that runs long enough to walk away
 * from — video renders, swaps, upscales.
 *
 * The choice is explicit on purpose. Asking for notification permission out of
 * nowhere reads as spam and gets denied reflexively, and a denial is permanent
 * per origin — one badly-timed prompt costs the feature forever. Requesting it
 * the instant someone picks "Notify me" means the browser dialog answers a
 * question they just asked.
 */
export type NotifyMode = "wait" | "notify";

export type DoneNotifier = {
  mode: NotifyMode;
  choose: (m: NotifyMode) => void;
  /** Permission was refused at the browser level — we cannot ask again. */
  blocked: boolean;
  /** Call when the job ends. No-ops unless the user opted in and left the tab. */
  fire: (title: string, body: string) => void;
};

export function useDoneNotifier(): DoneNotifier {
  const [mode, setMode] = useState<NotifyMode>("wait");
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "denied") setBlocked(true);
    // Already granted (e.g. from an earlier visit) — default to the useful
    // option rather than making them re-choose every time.
    if (Notification.permission === "granted") setMode("notify");
  }, []);

  const choose = useCallback((next: NotifyMode) => {
    if (next === "wait") {
      setMode("wait");
      return;
    }
    if (typeof Notification === "undefined") {
      setBlocked(true);
      return;
    }
    if (Notification.permission === "granted") {
      setMode("notify");
      return;
    }
    if (Notification.permission === "denied") {
      setBlocked(true);
      return;
    }
    Notification.requestPermission()
      .then((p) => {
        setMode(p === "granted" ? "notify" : "wait");
        if (p === "denied") setBlocked(true);
      })
      .catch(() => setMode("wait"));
  }, []);

  const fire = useCallback(
    (title: string, body: string) => {
      if (mode !== "notify") return;
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      // Only if they actually left. If the tab is in front, the result is
      // already on screen and a notification is noise on top of it.
      if (!document.hidden) return;
      try {
        new Notification(title, { body });
      } catch {
        /* some browsers refuse construction outside a user gesture */
      }
    },
    [mode],
  );

  return { mode, choose, blocked, fire };
}

/** The paired control. Render next to whatever button starts the job. */
export function NotifyChoice({ n, disabled = false }: { n: DoneNotifier; disabled?: boolean }) {
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-40 ${
      active
        ? "border-boss-violet bg-boss-violet/10 text-boss-violet"
        : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-400">While this runs:</span>
      <button type="button" onClick={() => n.choose("wait")} disabled={disabled} className={pill(n.mode === "wait")}>
        Wait here
      </button>
      <button
        type="button"
        onClick={() => n.choose("notify")}
        disabled={disabled || n.blocked}
        className={pill(n.mode === "notify")}
      >
        🔔 Notify me when it&rsquo;s done
      </button>
      <span className="w-full text-[11px] leading-relaxed text-slate-400">
        {n.blocked
          ? "Notifications are blocked for this site — allow them in your browser settings to use this."
          : n.mode === "notify"
            ? // Plain apostrophe, not &rsquo;: this is a JS string, not JSX text,
              // so an HTML entity here renders literally as "We&rsquo;ll".
              "You can switch tabs. We’ll send a browser notification when it finishes — or if it fails."
            : "Choosing “Notify me” asks your browser for notification permission."}
      </span>
    </div>
  );
}
