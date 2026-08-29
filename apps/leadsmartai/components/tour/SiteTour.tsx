"use client";

/**
 * The guided tour: a dimmed page with one thing lit up and a bubble explaining
 * it, pointing at the real sidebar rather than at a picture of it.
 *
 * Anchored rather than a slideshow because the point is to teach where things
 * are. A carousel of screenshots teaches what the app looks like; a spotlight
 * on the actual nav item teaches where to click next time — and it cannot go
 * stale, because it is pointing at the live page.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  TOUR_STEPS,
  TOUR_STORAGE_KEY,
  shouldAutoStart,
  visibleSteps,
  type TourStep,
} from "@/lib/tour/steps";

/** Breathing room around the lit element, in px. */
const HALO = 6;
const BUBBLE_WIDTH = 320;
const BUBBLE_GAP = 14;

type Rect = { top: number; left: number; width: number; height: number };

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * Where the bubble goes.
 *
 * Clamped to the viewport on both axes: the preferred side is a hint, not a
 * promise, and a bubble half off-screen is worse than one on the wrong side.
 */
function bubblePosition(anchor: Rect, placement: TourStep["placement"], vw: number, vh: number) {
  let top: number;
  let left: number;

  if (placement === "right") {
    top = anchor.top;
    left = anchor.left + anchor.width + BUBBLE_GAP;
    if (left + BUBBLE_WIDTH > vw - 8) left = anchor.left - BUBBLE_WIDTH - BUBBLE_GAP;
  } else if (placement === "left") {
    top = anchor.top;
    left = anchor.left - BUBBLE_WIDTH - BUBBLE_GAP;
    if (left < 8) left = anchor.left + anchor.width + BUBBLE_GAP;
  } else if (placement === "top") {
    top = anchor.top - BUBBLE_GAP;
    left = anchor.left;
  } else {
    top = anchor.top + anchor.height + BUBBLE_GAP;
    left = anchor.left;
  }

  left = Math.min(Math.max(8, left), Math.max(8, vw - BUBBLE_WIDTH - 8));
  top = Math.min(Math.max(8, top), Math.max(8, vh - 200));
  return { top, left };
}

export default function SiteTour() {
  const { t } = useTranslation("dashboard");
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);

  // Only the steps whose anchor is actually on this page — the sidebar is
  // filtered by role, so not everyone sees the same nav.
  const steps = useMemo(() => {
    if (!mounted) return [] as TourStep[];
    return visibleSteps(TOUR_STEPS, (sel) => Boolean(document.querySelector(sel)));
  }, [mounted]);

  useEffect(() => setMounted(true), []);

  const finish = useCallback(() => {
    setOpen(false);
    try {
      window.localStorage.setItem(TOUR_STORAGE_KEY, "done");
    } catch {
      // A browser that refuses storage just means the tour offers itself again.
    }
  }, []);

  // Decide whether to open. Deferred a tick so the sidebar has rendered —
  // asking before it exists would find no anchors and skip the whole tour.
  useEffect(() => {
    if (!mounted || steps.length === 0) return;
    let seen = false;
    try {
      seen = window.localStorage.getItem(TOUR_STORAGE_KEY) === "done";
    } catch {
      seen = false;
    }
    const requested = new URLSearchParams(window.location.search).get("tour") === "1";
    if (shouldAutoStart({ seen, requested, availableStepCount: steps.length })) {
      setIndex(0);
      setOpen(true);
    }
  }, [mounted, steps.length]);

  const current = open ? steps[index] : undefined;

  // Track the anchor: on step change, and while the page moves under it.
  useEffect(() => {
    if (!current) {
      setAnchor(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(current.selector);
      if (!el) {
        setAnchor(null);
        return;
      }
      setAnchor(rectOf(el));
    };
    const el = document.querySelector(current.selector);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    measure();

    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const id = window.setInterval(measure, 300);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.clearInterval(id);
    };
  }, [current]);

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        finish();
        return i;
      }
      return i + 1;
    });
  }, [steps.length, finish]);

  const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, finish]);

  // Move focus to the bubble each step so a screen reader follows along and the
  // arrow keys land somewhere sensible.
  useEffect(() => {
    if (open) bubbleRef.current?.focus();
  }, [open, index]);

  if (!mounted || !open || !current) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const box: Rect = anchor ?? { top: vh / 2, left: vw / 2, width: 0, height: 0 };
  const pos = bubblePosition(box, current.placement, vw, vh);
  const isLast = index === steps.length - 1;

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true">
      {/* The dim is a single ring of shadow around the cut-out, so the lit
          element stays genuinely interactive-looking and there is no seam. */}
      <div
        className="pointer-events-none absolute rounded-xl transition-all duration-200"
        style={{
          top: box.top - HALO,
          left: box.left - HALO,
          width: box.width + HALO * 2,
          height: box.height + HALO * 2,
          boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
        }}
      />
      {/* Clicking the dim leaves the tour — the standing convention, and the
          way out for anyone who opened it by accident. */}
      <button
        type="button"
        aria-label={t("pages.tour.close")}
        onClick={finish}
        className="absolute inset-0 h-full w-full cursor-default focus:outline-none"
      />

      <div
        ref={bubbleRef}
        tabIndex={-1}
        className="absolute rounded-2xl border border-slate-200 bg-white p-4 shadow-xl focus:outline-none"
        style={{ top: pos.top, left: pos.left, width: BUBBLE_WIDTH }}
      >
        <p className="text-sm font-semibold text-slate-900">{t(current.titleKey)}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{t(current.bodyKey)}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-400">
            {t("pages.tour.progress", { current: index + 1, total: steps.length })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={finish}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            >
              {t("pages.tour.skip")}
            </button>
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                {t("pages.tour.back")}
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {isLast ? t("pages.tour.done") : t("pages.tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
