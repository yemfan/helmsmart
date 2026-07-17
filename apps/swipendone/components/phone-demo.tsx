"use client";

import { useRef, useState } from "react";
import styles from "@/app/landing.module.css";

type Card = {
  tag: [number, number] | null;
  title: string;
  text: string;
  tip: string | null;
  art: keyof typeof ART;
  cta?: string;
};

const D: Record<"en" | "zh", { langBtn: string; back: string; next: string; again: string; diag: string; cards: Card[] }> = {
  en: {
    langBtn: "中文",
    back: "Back",
    next: "Next",
    again: "Replay",
    diag: "Something's wrong?",
    cards: [
      { tag: null, title: "Lund TV Stand", text: "About 25 minutes · 2 people recommended. You need a Phillips screwdriver — hex key included.", tip: null, art: "cover", cta: "Start assembly" },
      { tag: [1, 3], title: "Insert dowels into side panels", text: "Push 4 wooden dowels into the pre-drilled holes on the inner face of each side panel. No glue needed.", tip: "Holes only line up one way — if a dowel doesn't fit, flip the panel.", art: "dowel" },
      { tag: [2, 3], title: "Join sides to the bottom panel", text: "Slide each side panel onto the dowels, then turn the cam locks a half-turn clockwise until snug.", tip: "Half a turn is enough — over-tightening cracks the board.", art: "cam" },
      { tag: [3, 3], title: "You're done.", text: "Register your product to activate the 3-year warranty and free replacement parts.", tip: null, art: "done", cta: "Register warranty" },
    ],
  },
  zh: {
    langBtn: "EN",
    back: "上一步",
    next: "下一步",
    again: "重播",
    diag: "遇到问题？",
    cards: [
      { tag: null, title: "Lund 电视柜", text: "约25分钟 · 建议两人安装。所需工具：十字螺丝刀（内含六角扳手）。", tip: null, art: "cover", cta: "开始安装" },
      { tag: [1, 3], title: "将木销插入侧板", text: "将4个木销插入每块侧板内侧的预钻孔中。无需胶水，用手按入即可。", tip: "孔位只有一种对法，插不进时请将板翻面。", art: "dowel" },
      { tag: [2, 3], title: "连接侧板与底板", text: "把侧板对准木销装上，然后将偏心轮顺时针拧半圈至紧固。", tip: "拧半圈即可，过紧会导致板材开裂。", art: "cam" },
      { tag: [3, 3], title: "安装完成。", text: "注册您的产品，激活3年质保并享受免费零件补寄。", tip: null, art: "done", cta: "注册质保" },
    ],
  },
};

const ART = {
  cover: `<svg viewBox="0 0 320 200"><g fill="none" stroke="#1C2B24" stroke-width="2.5" stroke-linecap="round"><rect x="70" y="45" width="180" height="105" rx="3"/><path d="M88 150 L88 168 M80 168 L96 168 M232 150 L232 168 M224 168 L240 168"/></g><path d="M70 97 L250 97 M160 97 L160 150" stroke="#5A6B62" stroke-width="1.5" fill="none"/><rect x="120" y="12" width="80" height="26" rx="2" fill="none" stroke="#E8531F" stroke-width="2.5"/></svg>`,
  dowel: `<svg viewBox="0 0 320 200"><g fill="none" stroke="#1C2B24" stroke-width="2.5" stroke-linejoin="round"><path d="M70 25 L190 48 L190 178 L70 155 Z"/><circle cx="130" cy="100" r="7"/><circle cx="130" cy="65" r="7"/><circle cx="130" cy="135" r="7"/></g><g fill="none" stroke="#E8531F" stroke-width="2.5" stroke-linecap="round"><rect x="235" y="72" width="46" height="14" rx="7"/><path d="M228 79 L202 86 M210 80 L202 86 L211 92"/><rect x="235" y="122" width="46" height="14" rx="7"/><path d="M228 129 L202 126"/></g><text x="60" y="20" font-family="IBM Plex Mono" font-size="13" fill="#5A6B62">A</text><text x="286" y="66" font-family="IBM Plex Mono" font-size="13" fill="#E8531F">E</text></svg>`,
  cam: `<svg viewBox="0 0 320 200"><g fill="none" stroke="#1C2B24" stroke-width="2.5" stroke-linejoin="round"><path d="M60 140 L160 120 L260 140 L160 160 Z"/><path d="M78 35 L120 27 L120 118 L78 126 Z"/><path d="M200 27 L242 35 L242 126 L200 118 Z"/></g><g fill="none" stroke="#E8531F" stroke-width="2.5" stroke-linecap="round"><path d="M99 130 L99 146 M92 139 L99 146 L106 139 M221 130 L221 146 M214 139 L221 146 L228 139"/><circle cx="286" cy="62" r="16"/><path d="M286 38 A24 24 0 0 1 308 54 M308 54 L306 44 M308 54 L298 52"/></g><circle cx="286" cy="62" r="6" fill="none" stroke="#5A6B62" stroke-width="1.5"/><text x="278" y="98" font-family="IBM Plex Mono" font-size="13" fill="#E8531F">E</text></svg>`,
  done: `<svg viewBox="0 0 320 200"><circle cx="160" cy="90" r="46" fill="#E4EFE8" stroke="#2F6B4F" stroke-width="2.5"/><path d="M138 92 L154 108 L184 74" fill="none" stroke="#2F6B4F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

export function PhoneDemo() {
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);
  const t = D[lang];
  const card = t.cards[idx];
  const last = idx === t.cards.length - 1;
  const zh = lang === "zh";

  const bodyFont = zh
    ? "var(--font-zh-body)"
    : "var(--font-body)";
  const titleFont = zh ? "var(--font-zh-display)" : "var(--font-display)";

  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 45) return;
    const max = t.cards.length - 1;
    if (dx < 0 && idx < max) setIdx(idx + 1);
    else if (dx > 0 && idx > 0) setIdx(idx - 1);
  }

  return (
    <div>
      <div className={styles.phone} aria-label="Live demo of a SwipenDone guide">
        <div className={styles.screen}>
          <div className={styles.dHead}>
            <div className={styles.dBrand}>NORDHOLM</div>
            <button
              className={styles.dLang}
              onClick={() => setLang(zh ? "en" : "zh")}
              aria-label="Toggle demo language"
            >
              {t.langBtn}
            </button>
          </div>
          <div className={styles.dProg}>
            {t.cards.map((_, i) => (
              <span key={i} className={i <= idx ? styles.on : undefined} />
            ))}
          </div>
          <div
            className={styles.dBody}
            style={{ fontFamily: bodyFont }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {card.tag ? (
              <div className={styles.dTag}>
                <b>{String(card.tag[0]).padStart(2, "0")}</b>
                <i>/ {String(card.tag[1]).padStart(2, "0")}</i>
              </div>
            ) : (
              <div style={{ height: 6 }} />
            )}
            <div
              className={styles.dArt}
              dangerouslySetInnerHTML={{ __html: ART[card.art] }}
            />
            <div className={styles.dTitle} style={{ fontFamily: titleFont }}>
              {card.title}
            </div>
            <div className={styles.dText}>{card.text}</div>
            {card.tip && (
              <div className={styles.dTip}>
                <b>{zh ? "提示" : "TIP"}</b>
                <p>{card.tip}</p>
              </div>
            )}
            <div className={styles.dNavi}>
              {idx > 0 && (
                <button className={styles.dBack} onClick={() => setIdx(idx - 1)}>
                  ← {t.back}
                </button>
              )}
              <button
                className={styles.dNext}
                onClick={() => setIdx(last ? 0 : idx + 1)}
              >
                {card.cta ? card.cta : last ? t.again : t.next} →
              </button>
            </div>
            <div className={styles.dDiag}>🛟 {t.diag}</div>
          </div>
        </div>
      </div>
      <p className={styles.dHint}>← swipe the demo · scan-to-open, no app →</p>
    </div>
  );
}
