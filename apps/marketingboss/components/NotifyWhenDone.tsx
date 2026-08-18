"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  /**
   * `fire` is called from inside a job's async closure, captured when the run
   * STARTED. Reading `mode` directly would freeze the choice at that moment —
   * so switching to "Notify me" halfway through a five-minute render would do
   * nothing. The ref keeps fire() reading the live value.
   */
  const modeRef = useRef<NotifyMode>("wait");
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

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
      if (modeRef.current !== "notify") return;
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
    // No deps: everything read here is a ref or a global, so `fire` is stable.
    // That matters — a changing identity is what made the captured copy stale.
    [],
  );

  return { mode, choose, blocked, fire };
}

/**
 * The paired control. Render next to whatever button starts the job.
 *
 * Deliberately NOT disabled while the job runs. Mid-run is precisely when the
 * choice matters — you start a render, see it will take five minutes, and only
 * then decide to walk away. Locking it at that moment made the option useless.
 * Only a browser-level block disables anything here.
 */
export function NotifyChoice({ n }: { n: DoneNotifier }) {
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-40 ${
      active
        ? "border-boss-violet bg-boss-violet/10 text-boss-violet"
        : "border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-slate-400">While this runs:</span>
      <button type="button" onClick={() => n.choose("wait")} className={pill(n.mode === "wait")}>
        Wait here
      </button>
      <button
        type="button"
        onClick={() => n.choose("notify")}
        disabled={n.blocked}
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
