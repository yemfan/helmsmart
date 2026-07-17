import { useState, useRef, useEffect } from "react";

/* ---------- design tokens ---------- */
const T = {
  paper: "#F2F4F1",
  card: "#FFFFFF",
  ink: "#1C2B24",
  inkSoft: "#5A6B62",
  line: "#D6DCD6",
  accent: "#E8531F", // safety orange — box tape, utility knives
  green: "#2F6B4F",
  greenSoft: "#E4EFE8",
};

const fontLink = (
  <link
    href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;700&display=swap"
    rel="stylesheet"
  />
);

/* ---------- bilingual content ---------- */
const L = {
  en: {
    brand: "NORDHOLM",
    product: "Lund TV Stand · Model TV-2140",
    meta: "About 25 minutes · 2 people recommended",
    tools: "You need: Phillips screwdriver (included hex key)",
    start: "Start assembly",
    parts: "Check your parts",
    partsHint: "Tap each part as you find it in the box.",
    partsList: [
      ["A", "Side panel", 2],
      ["B", "Bottom panel", 1],
      ["C", "Middle shelf", 1],
      ["D", "Back panel", 1],
      ["E", "Cam lock + dowel set", 16],
      ["F", "Adjustable feet", 4],
    ],
    allFound: "All parts found — continue",
    missing: "Missing a part? Tap here — we'll ship it free.",
    steps: [
      {
        title: "Insert dowels into side panels",
        body: "Push 4 wooden dowels (E) into the pre-drilled holes on the inner face of each side panel (A). No glue needed — they press in by hand.",
        tip: "Holes only line up one way. If a dowel doesn't fit, flip the panel.",
      },
      {
        title: "Join sides to the bottom panel",
        body: "Stand the bottom panel (B) on its edge. Slide each side panel (A) onto the dowels, then turn the cam locks (E) clockwise a half-turn with the hex key until snug.",
        tip: "Half a turn is enough. Over-tightening cracks the board.",
      },
      {
        title: "Slide in the middle shelf",
        body: "Lower the middle shelf (C) between the side panels onto the four support pins. Press down until it sits flat on all corners.",
        tip: "The finished edge faces forward.",
      },
      {
        title: "Attach the back panel",
        body: "Lay the frame face-down. Place the back panel (D) into the rear groove, smooth side facing in, and secure with the small nails at each marked point.",
        tip: "Start nails in the corners first to square the frame.",
      },
      {
        title: "Flip upright and level the feet",
        body: "With two people, turn the unit upright. Screw in the four feet (F), then twist each to adjust until the stand doesn't rock.",
        tip: "Check level before loading — adjusting later is harder.",
      },
    ],
    stepWord: "Step",
    of: "of",
    tipWord: "Tip",
    back: "Back",
    next: "Next",
    finish: "Finish",
    doneTitle: "You're done.",
    doneBody: "Register your Lund TV Stand to activate the 3-year warranty and get free replacement parts.",
    register: "Register warranty",
    skip: "Skip for now",
    powered: "Made with SwipenDone",
    langBtn: "中文",
  },
  zh: {
    brand: "NORDHOLM",
    product: "Lund 电视柜 · 型号 TV-2140",
    meta: "约25分钟 · 建议两人安装",
    tools: "所需工具：十字螺丝刀（内含六角扳手）",
    start: "开始安装",
    parts: "核对零件",
    partsHint: "从箱中找到零件后，逐一点选。",
    partsList: [
      ["A", "侧板", 2],
      ["B", "底板", 1],
      ["C", "中层隔板", 1],
      ["D", "背板", 1],
      ["E", "偏心轮+木销套装", 16],
      ["F", "可调脚垫", 4],
    ],
    allFound: "零件齐全 — 继续",
    missing: "缺少零件？点此免费补寄。",
    steps: [
      {
        title: "将木销插入侧板",
        body: "将4个木销（E）插入每块侧板（A）内侧的预钻孔中。无需胶水，用手按入即可。",
        tip: "孔位只有一种对法。插不进时请将板翻面。",
      },
      {
        title: "连接侧板与底板",
        body: "将底板（B）立起。把侧板（A）对准木销装上，然后用六角扳手将偏心轮（E）顺时针拧半圈至紧固。",
        tip: "拧半圈即可，过紧会导致板材开裂。",
      },
      {
        title: "装入中层隔板",
        body: "将中层隔板（C）放入两侧板之间，落在四个支撑销上。按压四角，确保完全放平。",
        tip: "封边面朝前。",
      },
      {
        title: "安装背板",
        body: "将柜体正面朝下放置。把背板（D）放入后侧凹槽，光面朝内，在标记点用小钉固定。",
        tip: "先钉四角，便于校正柜体方正。",
      },
      {
        title: "翻正柜体并调平脚垫",
        body: "两人协作将柜体翻正。装上4个脚垫（F），逐一旋转调节，直至柜体不晃动。",
        tip: "放置物品前先确认水平，之后再调会更困难。",
      },
    ],
    stepWord: "步骤",
    of: "/",
    tipWord: "提示",
    back: "上一步",
    next: "下一步",
    finish: "完成",
    doneTitle: "安装完成。",
    doneBody: "注册您的 Lund 电视柜，激活3年质保，并享受免费零件补寄服务。",
    register: "注册质保",
    skip: "暂时跳过",
    powered: "由 SwipenDone 生成",
    langBtn: "EN",
  },
};

/* ---------- technical line-art SVGs ---------- */
const S = { stroke: T.ink, strokeWidth: 2.5, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };
const Sthin = { ...S, strokeWidth: 1.5, stroke: T.inkSoft };
const Sacc = { ...S, stroke: T.accent };

const Art = ({ idx }) => {
  const arts = [
    /* 0: dowels into side panel */
    <svg key="0" viewBox="0 0 320 220" style={{ width: "100%", height: "100%" }}>
      <path {...S} d="M70 30 L190 55 L190 195 L70 170 Z" />
      <path {...Sthin} d="M70 30 L88 22 L208 47 L190 55" />
      <path {...Sthin} d="M208 47 L208 187 L190 195" />
      {[70, 110, 150].map((y) => (
        <circle key={y} {...S} cx={130} cy={y + 40} r="7" />
      ))}
      <g>
        <rect {...Sacc} x="235" y="78" width="46" height="14" rx="7" />
        <path {...Sacc} d="M228 85 L200 92" markerEnd="url(#arr)" />
      </g>
      <g>
        <rect {...Sacc} x="235" y="128" width="46" height="14" rx="7" />
        <path {...Sacc} d="M228 135 L200 132" />
      </g>
      <path {...Sacc} d="M212 90 L196 96 M202 88 L196 96 L204 102" />
      <text x="60" y="24" fontFamily="IBM Plex Mono" fontSize="13" fill={T.inkSoft}>A</text>
      <text x="286" y="90" fontFamily="IBM Plex Mono" fontSize="13" fill={T.accent}>E</text>
    </svg>,
    /* 1: sides onto bottom, cam lock */
    <svg key="1" viewBox="0 0 320 220" style={{ width: "100%", height: "100%" }}>
      <path {...S} d="M60 150 L160 130 L260 150 L160 170 Z" />
      <path {...Sthin} d="M60 150 L60 162 L160 182 L260 162 L260 150 M160 170 L160 182" />
      <path {...S} d="M78 40 L120 32 L120 128 L78 136 Z" />
      <path {...S} d="M200 32 L242 40 L242 136 L200 128 Z" />
      <path {...Sacc} d="M99 140 L99 156 M99 156 L92 149 M99 156 L106 149" />
      <path {...Sacc} d="M221 140 L221 156 M221 156 L214 149 M221 156 L228 149" />
      <circle {...Sacc} cx="286" cy="70" r="16" />
      <circle {...Sthin} cx="286" cy="70" r="6" />
      <path {...Sacc} d="M286 46 A24 24 0 0 1 308 62" />
      <path {...Sacc} d="M308 62 L306 52 M308 62 L298 60" />
      <text x="70" y="30" fontFamily="IBM Plex Mono" fontSize="13" fill={T.inkSoft}>A</text>
      <text x="152" y="206" fontFamily="IBM Plex Mono" fontSize="13" fill={T.inkSoft}>B</text>
      <text x="278" y="106" fontFamily="IBM Plex Mono" fontSize="13" fill={T.accent}>E</text>
    </svg>,
    /* 2: shelf slides in */
    <svg key="2" viewBox="0 0 320 220" style={{ width: "100%", height: "100%" }}>
      <path {...S} d="M70 40 L100 34 L100 190 L70 196 Z" />
      <path {...S} d="M220 34 L250 40 L250 196 L220 190 Z" />
      <path {...S} d="M60 196 L160 180 L260 196 L160 212 Z" />
      <path {...Sacc} d="M108 84 L212 78 L212 92 L108 98 Z" />
      <path {...Sacc} d="M160 56 L160 72 M160 72 L152 65 M160 72 L168 65" />
      <circle {...Sthin} cx="104" cy="118" r="3" />
      <circle {...Sthin} cx="216" cy="114" r="3" />
      <text x="150" y="46" fontFamily="IBM Plex Mono" fontSize="13" fill={T.accent}>C</text>
    </svg>,
    /* 3: back panel, frame face down */
    <svg key="3" viewBox="0 0 320 220" style={{ width: "100%", height: "100%" }}>
      <path {...S} d="M55 90 L165 60 L275 90 L165 120 Z" />
      <path {...Sthin} d="M55 90 L55 150 L165 180 L165 120 M275 90 L275 150 L165 180" />
      <path {...Sacc} d="M85 52 L195 24 L245 38 L135 66 Z" />
      <path {...Sacc} d="M165 74 L165 58 M165 58 L157 64 M165 58 L173 64" />
      {[
        [92, 88], [238, 88], [165, 68], [110, 108], [220, 108],
      ].map(([x, y], i) => (
        <circle key={i} {...Sthin} cx={x} cy={y} r="2.5" fill={T.inkSoft} />
      ))}
      <text x="248" y="34" fontFamily="IBM Plex Mono" fontSize="13" fill={T.accent}>D</text>
    </svg>,
    /* 4: upright, feet, level */
    <svg key="4" viewBox="0 0 320 220" style={{ width: "100%", height: "100%" }}>
      <rect {...S} x="75" y="40" width="170" height="120" rx="3" />
      <path {...Sthin} d="M75 100 L245 100 M160 100 L160 160" />
      {[95, 225].map((x) => (
        <g key={x}>
          <path {...Sacc} d={`M${x} 160 L${x} 178`} />
          <path {...Sacc} d={`M${x - 9} 178 L${x + 9} 178`} />
          <path {...Sacc} d={`M${x - 6} 186 Q${x} 191 ${x + 6} 186`} />
        </g>
      ))}
      <path {...Sthin} d="M60 200 L260 200" strokeDasharray="4 5" />
      <circle {...Sacc} cx="286" cy="60" r="14" />
      <path {...Sacc} d="M279 60 L293 60 M286 53 L286 67" transform="rotate(45 286 60)" />
      <text x="82" y="34" fontFamily="IBM Plex Mono" fontSize="13" fill={T.inkSoft}>F ×4</text>
    </svg>,
  ];
  return arts[idx] || null;
};

const CoverArt = () => (
  <svg viewBox="0 0 320 200" style={{ width: "100%", height: "100%" }}>
    <rect {...S} x="70" y="45" width="180" height="105" rx="3" />
    <path {...Sthin} d="M70 97 L250 97 M160 97 L160 150" />
    {[88, 232].map((x) => (
      <path key={x} {...S} d={`M${x} 150 L${x} 168 M${x - 8} 168 L${x + 8} 168`} />
    ))}
    <rect {...Sacc} x="120" y="12" width="80" height="26" rx="2" />
    <path {...Sthin} d="M132 25 L188 25" />
  </svg>
);

/* ---------- main app ---------- */
export default function SwipenDoneGuide() {
  const [lang, setLang] = useState("en");
  const [screen, setScreen] = useState(0); // 0 cover, 1 parts, 2..6 steps, 7 done
  const [found, setFound] = useState({});
  const [dir, setDir] = useState(1);
  const touchX = useRef(null);
  const t = L[lang];
  const totalSteps = t.steps.length;
  const isStep = screen >= 2 && screen < 2 + totalSteps;
  const stepIdx = screen - 2;
  const allFound = t.partsList.every((_, i) => found[i]);

  const go = (n) => {
    setDir(n > screen ? 1 : -1);
    setScreen(Math.max(0, Math.min(7, n)));
  };

  const onTouchStart = (e) => (touchX.current = e.touches[0].clientX);
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && isStep && screen < 1 + totalSteps) go(screen + 1);
    else if (dx < 0 && isStep && screen === 1 + totalSteps) go(7);
    else if (dx > 0 && screen > 0 && screen !== 7) go(screen - 1);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" && isStep) go(screen === 1 + totalSteps ? 7 : screen + 1);
      if (e.key === "ArrowLeft" && screen > 0 && screen !== 7) go(screen - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const zh = lang === "zh";
  const bodyFont = zh
    ? "'Noto Sans SC', 'Inter', sans-serif"
    : "'Inter', 'Noto Sans SC', sans-serif";
  const dispFont = zh
    ? "'Noto Sans SC', 'Archivo', sans-serif"
    : "'Archivo', 'Noto Sans SC', sans-serif";

  const Btn = ({ children, onClick, primary, disabled, small }) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: bodyFont,
        fontWeight: 600,
        fontSize: small ? 13 : 15,
        padding: small ? "8px 14px" : "14px 22px",
        borderRadius: 10,
        border: primary ? "none" : `1.5px solid ${T.line}`,
        background: primary ? (disabled ? "#C9CFC9" : T.ink) : T.card,
        color: primary ? "#fff" : T.ink,
        cursor: disabled ? "default" : "pointer",
        transition: "transform 120ms ease, background 120ms ease",
        width: small ? "auto" : "100%",
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );

  /* die-cut step label — the signature element */
  const StepTag = ({ n }) => (
    <div
      style={{
        display: "inline-flex",
        alignItems: "baseline",
        gap: 8,
        border: `1.5px dashed ${T.accent}`,
        borderRadius: 8,
        padding: "6px 14px",
        background: "#FFF7F3",
      }}
    >
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 26, color: T.accent, lineHeight: 1 }}>
        {String(n).padStart(2, "0")}
      </span>
      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: T.inkSoft }}>
        / {String(totalSteps).padStart(2, "0")}
      </span>
    </div>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: T.paper,
        display: "flex",
        justifyContent: "center",
        fontFamily: bodyFont,
        color: T.ink,
      }}
    >
      {fontLink}
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateX(${dir * 28}px); } to { opacity: 1; transform: none; } }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        button:focus-visible { outline: 2.5px solid ${T.accent}; outline-offset: 2px; }
      `}</style>

      <div
        style={{ width: "100%", maxWidth: 430, minHeight: "100vh", display: "flex", flexDirection: "column", background: T.paper }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px 8px" }}>
          <div style={{ fontFamily: dispFont, fontWeight: 800, fontSize: 15, letterSpacing: "0.08em" }}>{t.brand}</div>
          <button
            onClick={() => setLang(zh ? "en" : "zh")}
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 13,
              fontWeight: 500,
              padding: "5px 12px",
              borderRadius: 999,
              border: `1.5px solid ${T.line}`,
              background: T.card,
              color: T.ink,
              cursor: "pointer",
            }}
          >
            {t.langBtn}
          </button>
        </div>

        {/* progress */}
        <div style={{ display: "flex", gap: 4, padding: "4px 18px 12px" }}>
          {Array.from({ length: totalSteps + 2 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 3.5,
                borderRadius: 2,
                background: i <= (screen === 7 ? totalSteps + 1 : screen) ? T.accent : T.line,
                transition: "background 200ms ease",
              }}
            />
          ))}
        </div>

        {/* card */}
        <div key={screen + lang} style={{ flex: 1, display: "flex", flexDirection: "column", padding: "0 18px 18px", animation: "slideIn 240ms ease" }}>
          {screen === 0 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ background: T.card, borderRadius: 16, border: `1.5px solid ${T.line}`, padding: "26px 10px 10px", height: 230 }}>
                <CoverArt />
              </div>
              <h1 style={{ fontFamily: dispFont, fontWeight: 800, fontSize: 30, lineHeight: 1.15, margin: "26px 0 10px" }}>{t.product}</h1>
              <p style={{ fontSize: 15, color: T.inkSoft, margin: "0 0 6px" }}>{t.meta}</p>
              <p style={{ fontSize: 15, color: T.inkSoft, margin: 0 }}>{t.tools}</p>
              <div style={{ marginTop: "auto", paddingTop: 24 }}>
                <Btn primary onClick={() => go(1)}>{t.start} →</Btn>
              </div>
            </div>
          )}

          {screen === 1 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <h2 style={{ fontFamily: dispFont, fontWeight: 800, fontSize: 26, margin: "6px 0 4px" }}>{t.parts}</h2>
              <p style={{ fontSize: 14, color: T.inkSoft, margin: "0 0 14px" }}>{t.partsHint}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {t.partsList.map(([code, name, qty], i) => (
                  <button
                    key={code}
                    onClick={() => setFound((f) => ({ ...f, [i]: !f[i] }))}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: `1.5px solid ${found[i] ? T.green : T.line}`,
                      background: found[i] ? T.greenSoft : T.card,
                      cursor: "pointer",
                      textAlign: "left",
                      fontFamily: bodyFont,
                      transition: "all 140ms ease",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontWeight: 600,
                        fontSize: 14,
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        background: found[i] ? T.green : T.ink,
                        color: "#fff",
                        flexShrink: 0,
                      }}
                    >
                      {code}
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 500, flex: 1, color: T.ink }}>{name}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: T.inkSoft }}>×{qty}</span>
                    <span style={{ fontSize: 16, color: found[i] ? T.green : T.line }}>{found[i] ? "✓" : "○"}</span>
                  </button>
                ))}
              </div>
              <button
                style={{ background: "none", border: "none", color: T.accent, fontSize: 13.5, fontFamily: bodyFont, fontWeight: 500, marginTop: 12, cursor: "pointer", textAlign: "left", padding: 0 }}
              >
                {t.missing}
              </button>
              <div style={{ marginTop: "auto", paddingTop: 18 }}>
                <Btn primary disabled={!allFound} onClick={() => go(2)}>{t.allFound} →</Btn>
              </div>
            </div>
          )}

          {isStep && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <StepTag n={stepIdx + 1} />
              <div style={{ background: T.card, borderRadius: 16, border: `1.5px solid ${T.line}`, height: 230, marginTop: 14, padding: "8px 4px" }}>
                <Art idx={stepIdx} />
              </div>
              <h2 style={{ fontFamily: dispFont, fontWeight: 700, fontSize: 23, lineHeight: 1.2, margin: "18px 0 8px" }}>
                {t.steps[stepIdx].title}
              </h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.55, margin: 0, color: T.ink }}>{t.steps[stepIdx].body}</p>
              <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "#EDF0EC", borderLeft: `3px solid ${T.green}` }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, fontWeight: 600, color: T.green, letterSpacing: "0.06em" }}>
                  {t.tipWord.toUpperCase()}
                </span>
                <p style={{ fontSize: 13.5, margin: "3px 0 0", color: T.inkSoft, lineHeight: 1.5 }}>{t.steps[stepIdx].tip}</p>
              </div>
              <div style={{ marginTop: "auto", paddingTop: 18, display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <Btn onClick={() => go(screen - 1)}>← {t.back}</Btn>
                </div>
                <div style={{ flex: 2 }}>
                  <Btn primary onClick={() => go(screen === 1 + totalSteps ? 7 : screen + 1)}>
                    {screen === 1 + totalSteps ? t.finish : t.next} →
                  </Btn>
                </div>
              </div>
            </div>
          )}

          {screen === 7 && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 40 }}>
              <div
                style={{
                  width: 84,
                  height: 84,
                  borderRadius: "50%",
                  background: T.greenSoft,
                  border: `2px solid ${T.green}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 38,
                  color: T.green,
                }}
              >
                ✓
              </div>
              <h2 style={{ fontFamily: dispFont, fontWeight: 800, fontSize: 32, margin: "22px 0 10px" }}>{t.doneTitle}</h2>
              <p style={{ fontSize: 15.5, lineHeight: 1.55, color: T.inkSoft, maxWidth: 320, margin: 0 }}>{t.doneBody}</p>
              <div style={{ width: "100%", marginTop: 28, display: "flex", flexDirection: "column", gap: 10 }}>
                <Btn primary onClick={() => {}}>{t.register}</Btn>
                <Btn onClick={() => go(0)}>{t.skip}</Btn>
              </div>
              <div style={{ marginTop: "auto", paddingTop: 30, paddingBottom: 6 }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: T.inkSoft }}>
                  ⚡ {t.powered}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
