"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { logScan, registerWarranty } from "@/lib/actions/guide";
import type { GuideBundle } from "@/lib/types";
import {
  LOCALE_LABELS,
  LOCALE_NAMES,
  LOCALE_SCRIPT,
  pick,
  type Locale,
} from "@/lib/locales";
import { UI } from "@/lib/ui-strings";

/* ---------- design tokens (handoff §2 — do not change) ---------- */
const T = {
  paper: "#F2F4F1",
  card: "#FFFFFF",
  ink: "#1C2B24",
  inkSoft: "#5A6B62",
  line: "#D6DCD6",
  accent: "#E8531F",
  green: "#2F6B4F",
  greenSoft: "#E4EFE8",
};

function fontsFor(locale: Locale) {
  const s = LOCALE_SCRIPT[locale];
  if (s === "sc") return { body: "var(--font-zh-body)", disp: "var(--font-zh-display)" };
  if (s === "jp") return { body: "var(--font-jp-body)", disp: "var(--font-jp-display)" };
  return { body: "var(--font-body)", disp: "var(--font-display)" };
}

const PlaceholderArt = () => (
  <svg viewBox="0 0 320 200" style={{ width: "100%", height: "100%" }} aria-hidden="true">
    <g fill="none" stroke={T.line} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="70" y="50" width="180" height="100" rx="6" />
      <path d="M70 120 L120 90 L160 115 L210 80 L250 110" />
      <circle cx="110" cy="80" r="10" />
    </g>
  </svg>
);

export function BuyerGuide({ bundle }: { bundle: GuideBundle }) {
  const { guide, product, brand_name, steps } = bundle;
  const totalSteps = steps.length;
  const DONE = totalSteps + 2;

  const languages: Locale[] = guide.languages?.length ? guide.languages : ["en"];
  const [lang, setLang] = useState<Locale>(languages[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [screen, setScreen] = useState(0);
  const [found, setFound] = useState<Record<number, boolean>>({});
  const [dir, setDir] = useState(1);
  const [regEmail, setRegEmail] = useState("");
  const [regState, setRegState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [regMsg, setRegMsg] = useState("");
  const touchX = useRef<number | null>(null);
  const scanId = useRef<string | null>(null);

  const t = UI[lang] ?? UI.en;
  const f = fontsFor(lang);
  const mono = "var(--font-mono)";

  const isStep = screen >= 2 && screen < 2 + totalSteps;
  const stepIdx = screen - 2;

  const parts = guide.parts || [];
  const allFound = parts.length === 0 || parts.every((_, i) => found[i]);

  const productName = pick(product.name, lang);
  const productLine = product.model_no ? `${productName} · ${product.model_no}` : productName;
  const meta = guide.meta?.[lang] ?? guide.meta?.en;
  const metaLine = [meta?.time_estimate, meta?.people].filter(Boolean).join(" · ");
  const toolsLine = meta?.tools ? `${t.toolsPrefix}${meta.tools}` : "";

  const step = isStep ? steps[stepIdx] : null;
  const stepTitle = step ? pick(step.title, lang) : "";
  const stepBody = step ? pick(step.body, lang) : "";
  const stepTip = step ? pick(step.tip, lang) : "";
  const stepImg: string | null = step?.image_url ?? null;
  const coverImg: string | null = steps[0]?.image_url ?? null;

  const progressFilled = screen === DONE ? totalSteps + 1 : screen;

  /* ---------- analytics ---------- */
  const logEvent = useCallback(
    (action: string, step_position?: number) => {
      try {
        const payload = JSON.stringify({
          guide_id: guide.id,
          scan_id: scanId.current,
          step_position: step_position ?? null,
          action,
        });
        if (navigator.sendBeacon) {
          navigator.sendBeacon("/api/e", new Blob([payload], { type: "application/json" }));
        } else {
          fetch("/api/e", { method: "POST", body: payload, keepalive: true });
        }
      } catch {
        /* never block the UI */
      }
    },
    [guide.id]
  );

  useEffect(() => {
    let active = true;
    logScan(guide.id, lang).then(({ scanId: id }) => {
      if (active) scanId.current = id;
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guide.id]);

  useEffect(() => {
    if (isStep) logEvent("view", stepIdx + 1);
    if (screen === DONE) logEvent("finished");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const go = (n: number) => {
    setDir(n > screen ? 1 : -1);
    setScreen(Math.max(0, Math.min(DONE, n)));
  };

  const onTouchStart = (e: React.TouchEvent) => (touchX.current = e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && isStep) go(screen === 1 + totalSteps ? DONE : screen + 1);
    else if (dx > 0 && screen > 0 && screen !== DONE) go(screen - 1);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" && isStep) go(screen === 1 + totalSteps ? DONE : screen + 1);
      if (e.key === "ArrowLeft" && screen > 0 && screen !== DONE) go(screen - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function onRegister() {
    logEvent("register_clicked");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      setRegState("error");
      setRegMsg(t.invalidEmail);
      return;
    }
    setRegState("sending");
    const res = await registerWarranty(guide.id, regEmail);
    if (res.ok) setRegState("done");
    else {
      setRegState("error");
      setRegMsg(res.message);
    }
  }

  const btn = (primary: boolean, disabled = false): React.CSSProperties => ({
    fontFamily: f.body,
    fontWeight: 600,
    fontSize: 15,
    padding: "14px 22px",
    borderRadius: 10,
    border: primary ? "none" : `1.5px solid ${T.line}`,
    background: primary ? (disabled ? "#C9CFC9" : T.ink) : T.card,
    color: primary ? "#fff" : T.ink,
    cursor: disabled ? "default" : "pointer",
    width: "100%",
  });

  const StepTag = ({ n }: { n: number }) => (
    <div style={{ display: "inline-flex", alignItems: "baseline", gap: 8, border: `1.5px dashed ${T.accent}`, borderRadius: 8, padding: "6px 14px", background: "#FFF7F3", width: "max-content" }}>
      <span style={{ fontFamily: mono, fontWeight: 600, fontSize: 26, color: T.accent, lineHeight: 1 }}>{String(n).padStart(2, "0")}</span>
      <span style={{ fontFamily: mono, fontSize: 12, color: T.inkSoft }}>/ {String(totalSteps).padStart(2, "0")}</span>
    </div>
  );

  return (
    <div lang={lang} style={{ minHeight: "100vh", background: T.paper, display: "flex", justifyContent: "center", fontFamily: f.body, color: T.ink }}>
      <style>{`
        @keyframes sdSlideIn { from { opacity: 0; transform: translateX(${dir * 28}px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { .sd-anim { animation: none !important; } }
        .sd-focus:focus-visible { outline: 2.5px solid ${T.accent}; outline-offset: 2px; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 430, minHeight: "100vh", display: "flex", flexDirection: "column", background: T.paper }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 8px", position: "relative" }}>
          <div style={{ fontFamily: f.disp, fontWeight: 800, fontSize: 15, letterSpacing: "0.08em" }}>{brand_name || " "}</div>
          {languages.length > 1 && (
            <div style={{ position: "relative" }}>
              <button
                className="sd-focus"
                onClick={() => setPickerOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={pickerOpen}
                aria-label={t.language}
                style={{ fontFamily: mono, fontSize: 13, fontWeight: 500, padding: "5px 12px", borderRadius: 999, border: `1.5px solid ${T.line}`, background: T.card, color: T.ink, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                <span aria-hidden>🌐</span>
                {LOCALE_LABELS[lang]}
                <span aria-hidden style={{ fontSize: 9 }}>▾</span>
              </button>
              {pickerOpen && (
                <ul
                  role="listbox"
                  style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 10, listStyle: "none", margin: 0, padding: 6, background: T.card, border: `1.5px solid ${T.line}`, borderRadius: 12, boxShadow: "0 8px 24px rgba(28,43,36,.14)", minWidth: 150 }}
                >
                  {languages.map((l) => (
                    <li key={l}>
                      <button
                        role="option"
                        aria-selected={l === lang}
                        className="sd-focus"
                        onClick={() => {
                          setLang(l);
                          setPickerOpen(false);
                        }}
                        style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "9px 12px", border: "none", borderRadius: 8, background: l === lang ? T.greenSoft : "transparent", color: T.ink, cursor: "pointer", fontFamily: fontsFor(l).body, fontSize: 14, fontWeight: l === lang ? 600 : 500, textAlign: "left" }}
                      >
                        <span>{LOCALE_NAMES[l]}</span>
                        <span style={{ fontFamily: mono, fontSize: 11, color: T.inkSoft }}>{LOCALE_LABELS[l]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* progress */}
        <div style={{ display: "flex", gap: 4, padding: "4px 18px 12px" }} aria-hidden="true">
          {Array.from({ length: totalSteps + 2 }).map((_, i) => (
            <div key={i} style={{ flex: 1, height: 3.5, borderRadius: 2, background: i <= progressFilled ? T.accent : T.line }} />
          ))}
        </div>

        <div key={`${screen}-${lang}`} className="sd-anim" style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 18px 18px", animation: "sdSlideIn 240ms ease" }}>
          {/* cover */}
          {screen === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ background: T.card, borderRadius: 16, border: `1.5px solid ${T.line}`, padding: "10px", height: 230, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {coverImg ? (
                  <Image src={coverImg} alt="" width={410} height={230} style={{ width: "100%", height: "100%", objectFit: "contain" }} unoptimized />
                ) : (
                  <PlaceholderArt />
                )}
              </div>
              <h1 style={{ fontFamily: f.disp, fontWeight: 800, fontSize: 30, lineHeight: 1.15, margin: "26px 0 10px" }}>{productLine}</h1>
              {metaLine && <p style={{ fontSize: 15, color: T.inkSoft, margin: "0 0 6px" }}>{metaLine}</p>}
              {toolsLine && <p style={{ fontSize: 15, color: T.inkSoft, margin: 0 }}>{toolsLine}</p>}
              <div style={{ marginTop: "auto", paddingTop: 24 }}>
                <button className="sd-focus" style={btn(true)} onClick={() => go(parts.length ? 1 : 2)}>{t.start} →</button>
              </div>
            </div>
          )}

          {/* parts */}
          {screen === 1 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <h2 style={{ fontFamily: f.disp, fontWeight: 800, fontSize: 26, margin: "6px 0 4px" }}>{t.parts}</h2>
              <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>{t.partsHint}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {parts.map((p, i) => {
                  const name = pick(p.name, lang);
                  return (
                    <button key={p.code + i} className="sd-focus" onClick={() => setFound((prev) => ({ ...prev, [i]: !prev[i] }))} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12, border: `1.5px solid ${found[i] ? T.green : T.line}`, background: found[i] ? T.greenSoft : T.card, cursor: "pointer", textAlign: "left", fontFamily: f.body }}>
                      <span style={{ fontFamily: mono, fontWeight: 600, fontSize: 14, width: 28, height: 28, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: found[i] ? T.green : T.ink, color: "#fff", flexShrink: 0 }}>{p.code}</span>
                      <span style={{ fontSize: 15, fontWeight: 500, flex: 1, color: T.ink }}>{name}</span>
                      <span style={{ fontFamily: mono, fontSize: 13, color: T.inkSoft }}>×{p.qty}</span>
                      <span style={{ fontSize: 16, color: found[i] ? T.green : T.line }}>{found[i] ? "✓" : "○"}</span>
                    </button>
                  );
                })}
              </div>
              <button style={{ background: "none", border: "none", color: T.accent, fontSize: 13.5, fontFamily: f.body, fontWeight: 500, marginTop: 12, cursor: "pointer", textAlign: "left", padding: 0 }}>{t.missing}</button>
              <div style={{ marginTop: "auto", paddingTop: 18 }}>
                <button className="sd-focus" style={btn(true, !allFound)} disabled={!allFound} onClick={() => { logEvent("parts_checked"); go(2); }}>{t.allFound} →</button>
              </div>
            </div>
          )}

          {/* step */}
          {isStep && step && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <StepTag n={stepIdx + 1} />
              <div style={{ background: T.card, borderRadius: 16, border: `1.5px solid ${T.line}`, height: 230, marginTop: 14, padding: "8px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {stepImg ? (
                  <Image src={stepImg} alt={stepTitle} width={410} height={230} style={{ width: "100%", height: "100%", objectFit: "contain" }} unoptimized />
                ) : (
                  <PlaceholderArt />
                )}
              </div>
              <h2 style={{ fontFamily: f.disp, fontWeight: 700, fontSize: 23, lineHeight: 1.2, margin: "18px 0 8px" }}>{stepTitle}</h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.55, margin: 0, color: T.ink }}>{stepBody}</p>
              {stepTip && (
                <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "#EDF0EC", borderLeft: `3px solid ${T.green}` }}>
                  <span style={{ fontFamily: mono, fontSize: 11.5, fontWeight: 600, color: T.green, letterSpacing: "0.06em" }}>{t.tipWord}</span>
                  <p style={{ fontSize: 13.5, margin: "3px 0 0", color: T.inkSoft, lineHeight: 1.5 }}>{stepTip}</p>
                </div>
              )}
              <div style={{ marginTop: "auto", paddingTop: 18, display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <button className="sd-focus" style={btn(false)} onClick={() => go(screen - 1)}>← {t.back}</button>
                </div>
                <div style={{ flex: 2 }}>
                  <button className="sd-focus" style={btn(true)} onClick={() => go(screen === 1 + totalSteps ? DONE : screen + 1)}>{screen === 1 + totalSteps ? t.finish : t.next} →</button>
                </div>
              </div>
            </div>
          )}

          {/* done */}
          {screen === DONE && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 40 }}>
              <div style={{ width: 84, height: 84, borderRadius: "50%", background: T.greenSoft, border: `2px solid ${T.green}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 38, color: T.green }}>✓</div>
              <h2 style={{ fontFamily: f.disp, fontWeight: 800, fontSize: 32, margin: "22px 0 10px" }}>{t.doneTitle}</h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.55, color: T.inkSoft, maxWidth: 320, margin: 0 }}>{t.doneBody}</p>

              {regState === "done" ? (
                <div style={{ marginTop: 24, padding: "14px 18px", borderRadius: 12, background: T.greenSoft, color: T.green, fontWeight: 600 }}>{t.registered}</div>
              ) : (
                <div style={{ width: "100%", marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
                  <input type="email" value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder={t.emailPlaceholder} aria-label={t.register} className="sd-focus" style={{ fontFamily: f.body, fontSize: 15, padding: "14px 16px", border: `1.5px solid ${T.line}`, borderRadius: 10, background: T.card, color: T.ink, textAlign: "center" }} />
                  <button className="sd-focus" style={btn(true, regState === "sending")} disabled={regState === "sending"} onClick={onRegister}>{regState === "sending" ? "…" : t.register}</button>
                  {regState === "error" && <p role="status" style={{ color: T.accent, fontSize: 13.5, margin: 0 }}>{regMsg}</p>}
                  <button className="sd-focus" style={btn(false)} onClick={() => go(0)}>{t.skip}</button>
                </div>
              )}

              <div style={{ marginTop: "auto", paddingTop: 30, paddingBottom: 6 }}>
                <Link href="/" style={{ fontFamily: mono, fontSize: 12, color: T.inkSoft, textDecoration: "none" }}>⚡ {t.powered}</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
