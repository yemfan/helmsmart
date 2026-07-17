"use client";

import { useRef, useState } from "react";
import { LOCALES, LOCALE_LABELS, LOCALE_SCRIPT, type Locale } from "@/lib/locales";
import styles from "@/app/landing.module.css";

type ArtKey = "cover" | "dowel" | "cam" | "done";

// Language-neutral card structure (art + step tag + whether it has a CTA button).
const CARD_META: { tag: [number, number] | null; art: ArtKey; hasCta: boolean }[] = [
  { tag: null, art: "cover", hasCta: true },
  { tag: [1, 3], art: "dowel", hasCta: false },
  { tag: [2, 3], art: "cam", hasCta: false },
  { tag: [3, 3], art: "done", hasCta: true },
];

interface CardText {
  title: string;
  text: string;
  tip: string | null;
  cta?: string;
}
interface LangStrings {
  back: string;
  next: string;
  again: string;
  diag: string;
  tip: string;
  cards: CardText[];
}

const STRINGS: Record<Locale, LangStrings> = {
  en: {
    back: "Back", next: "Next", again: "Replay", diag: "Something's wrong?", tip: "TIP",
    cards: [
      { title: "Lund TV Stand", text: "About 25 minutes · 2 people recommended. You need a Phillips screwdriver — hex key included.", tip: null, cta: "Start assembly" },
      { title: "Insert dowels into side panels", text: "Push 4 wooden dowels into the pre-drilled holes on the inner face of each side panel. No glue needed.", tip: "Holes only line up one way — if a dowel doesn't fit, flip the panel." },
      { title: "Join sides to the bottom panel", text: "Slide each side panel onto the dowels, then turn the cam locks a half-turn clockwise until snug.", tip: "Half a turn is enough — over-tightening cracks the board." },
      { title: "You're done.", text: "Register your product to activate the 3-year warranty and free replacement parts.", tip: null, cta: "Register warranty" },
    ],
  },
  zh: {
    back: "上一步", next: "下一步", again: "重播", diag: "遇到问题？", tip: "提示",
    cards: [
      { title: "Lund 电视柜", text: "约25分钟 · 建议两人安装。所需工具：十字螺丝刀（内含六角扳手）。", tip: null, cta: "开始安装" },
      { title: "将木销插入侧板", text: "将4个木销插入每块侧板内侧的预钻孔中。无需胶水，用手按入即可。", tip: "孔位只有一种对法，插不进时请将板翻面。" },
      { title: "连接侧板与底板", text: "把侧板对准木销装上，然后将偏心轮顺时针拧半圈至紧固。", tip: "拧半圈即可，过紧会导致板材开裂。" },
      { title: "安装完成。", text: "注册您的产品，激活3年质保并享受免费零件补寄。", tip: null, cta: "注册质保" },
    ],
  },
  es: {
    back: "Atrás", next: "Siguiente", again: "Repetir", diag: "¿Algún problema?", tip: "CONSEJO",
    cards: [
      { title: "Mueble TV Lund", text: "Unos 25 minutos · 2 personas recomendadas. Necesitas un destornillador Phillips — llave hexagonal incluida.", tip: null, cta: "Comenzar el montaje" },
      { title: "Inserta los pasadores en los paneles laterales", text: "Introduce 4 pasadores de madera en los orificios pretaladrados de la cara interior de cada panel lateral. Sin pegamento.", tip: "Los orificios solo encajan de una forma — si un pasador no entra, gira el panel." },
      { title: "Une los laterales al panel inferior", text: "Desliza cada panel lateral sobre los pasadores y gira las levas media vuelta en sentido horario hasta ajustarlas.", tip: "Media vuelta basta — apretar de más agrieta el tablero." },
      { title: "¡Listo!", text: "Registra tu producto para activar la garantía de 3 años y piezas de repuesto gratis.", tip: null, cta: "Registrar garantía" },
    ],
  },
  fr: {
    back: "Retour", next: "Suivant", again: "Rejouer", diag: "Un problème ?", tip: "ASTUCE",
    cards: [
      { title: "Meuble TV Lund", text: "Environ 25 minutes · 2 personnes recommandées. Il vous faut un tournevis cruciforme — clé hexagonale incluse.", tip: null, cta: "Commencer le montage" },
      { title: "Insérez les chevilles dans les panneaux latéraux", text: "Enfoncez 4 chevilles en bois dans les trous pré-percés sur la face intérieure de chaque panneau latéral. Sans colle.", tip: "Les trous ne s'alignent que d'un côté — si une cheville ne rentre pas, retournez le panneau." },
      { title: "Assemblez les côtés au panneau inférieur", text: "Glissez chaque panneau latéral sur les chevilles, puis tournez les cames d'un demi-tour dans le sens horaire.", tip: "Un demi-tour suffit — trop serrer fissure le panneau." },
      { title: "C'est terminé !", text: "Enregistrez votre produit pour activer la garantie de 3 ans et des pièces de rechange gratuites.", tip: null, cta: "Enregistrer la garantie" },
    ],
  },
  de: {
    back: "Zurück", next: "Weiter", again: "Nochmal", diag: "Etwas kaputt?", tip: "TIPP",
    cards: [
      { title: "Lund TV-Möbel", text: "Etwa 25 Minuten · 2 Personen empfohlen. Du brauchst einen Kreuzschlitzschraubendreher — Inbusschlüssel enthalten.", tip: null, cta: "Montage starten" },
      { title: "Dübel in die Seitenteile stecken", text: "Drücke 4 Holzdübel in die vorgebohrten Löcher an der Innenseite jedes Seitenteils. Kein Kleber nötig.", tip: "Die Löcher passen nur in eine Richtung — passt ein Dübel nicht, drehe das Teil um." },
      { title: "Seiten mit der Bodenplatte verbinden", text: "Schiebe jedes Seitenteil auf die Dübel und drehe die Exzenter eine halbe Umdrehung im Uhrzeigersinn fest.", tip: "Eine halbe Umdrehung reicht — zu festes Anziehen bricht die Platte." },
      { title: "Fertig!", text: "Registriere dein Produkt für die 3-Jahres-Garantie und kostenlose Ersatzteile.", tip: null, cta: "Garantie registrieren" },
    ],
  },
  ja: {
    back: "戻る", next: "次へ", again: "リプレイ", diag: "問題がありますか？", tip: "ヒント",
    cards: [
      { title: "Lund テレビスタンド", text: "約25分 · 2人推奨。プラスドライバーが必要です（六角レンチ付属）。", tip: null, cta: "組み立てを開始" },
      { title: "側板にダボを差し込む", text: "各側板の内側の下穴に木製ダボを4本押し込みます。接着剤は不要です。", tip: "穴の向きは一方向のみ。入らない場合は板を裏返してください。" },
      { title: "側板を底板に接合する", text: "各側板をダボに差し込み、カムロックを時計回りに半回転させて締めます。", tip: "半回転で十分です。締めすぎると板が割れます。" },
      { title: "完成です。", text: "製品を登録して3年保証と無料交換部品を有効にしましょう。", tip: null, cta: "保証を登録" },
    ],
  },
};

const ART: Record<ArtKey, string> = {
  cover: `<svg viewBox="0 0 320 200"><g fill="none" stroke="#1C2B24" stroke-width="2.5" stroke-linecap="round"><rect x="70" y="45" width="180" height="105" rx="3"/><path d="M88 150 L88 168 M80 168 L96 168 M232 150 L232 168 M224 168 L240 168"/></g><path d="M70 97 L250 97 M160 97 L160 150" stroke="#5A6B62" stroke-width="1.5" fill="none"/><rect x="120" y="12" width="80" height="26" rx="2" fill="none" stroke="#E8531F" stroke-width="2.5"/></svg>`,
  dowel: `<svg viewBox="0 0 320 200"><g fill="none" stroke="#1C2B24" stroke-width="2.5" stroke-linejoin="round"><path d="M70 25 L190 48 L190 178 L70 155 Z"/><circle cx="130" cy="100" r="7"/><circle cx="130" cy="65" r="7"/><circle cx="130" cy="135" r="7"/></g><g fill="none" stroke="#E8531F" stroke-width="2.5" stroke-linecap="round"><rect x="235" y="72" width="46" height="14" rx="7"/><path d="M228 79 L202 86 M210 80 L202 86 L211 92"/><rect x="235" y="122" width="46" height="14" rx="7"/><path d="M228 129 L202 126"/></g><text x="60" y="20" font-family="IBM Plex Mono" font-size="13" fill="#5A6B62">A</text><text x="286" y="66" font-family="IBM Plex Mono" font-size="13" fill="#E8531F">E</text></svg>`,
  cam: `<svg viewBox="0 0 320 200"><g fill="none" stroke="#1C2B24" stroke-width="2.5" stroke-linejoin="round"><path d="M60 140 L160 120 L260 140 L160 160 Z"/><path d="M78 35 L120 27 L120 118 L78 126 Z"/><path d="M200 27 L242 35 L242 126 L200 118 Z"/></g><g fill="none" stroke="#E8531F" stroke-width="2.5" stroke-linecap="round"><path d="M99 130 L99 146 M92 139 L99 146 L106 139 M221 130 L221 146 M214 139 L221 146 L228 139"/><circle cx="286" cy="62" r="16"/><path d="M286 38 A24 24 0 0 1 308 54 M308 54 L306 44 M308 54 L298 52"/></g><circle cx="286" cy="62" r="6" fill="none" stroke="#5A6B62" stroke-width="1.5"/><text x="278" y="98" font-family="IBM Plex Mono" font-size="13" fill="#E8531F">E</text></svg>`,
  done: `<svg viewBox="0 0 320 200"><circle cx="160" cy="90" r="46" fill="#E4EFE8" stroke="#2F6B4F" stroke-width="2.5"/><path d="M138 92 L154 108 L184 74" fill="none" stroke="#2F6B4F" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

function bodyFont(l: Locale) {
  const s = LOCALE_SCRIPT[l];
  if (s === "sc") return "var(--font-zh-body)";
  if (s === "jp") return "var(--font-jp-body)";
  return "var(--font-body)";
}
function dispFont(l: Locale) {
  const s = LOCALE_SCRIPT[l];
  if (s === "sc") return "var(--font-zh-display)";
  if (s === "jp") return "var(--font-jp-display)";
  return "var(--font-display)";
}

export function PhoneDemo() {
  const [lang, setLang] = useState<Locale>("en");
  const [idx, setIdx] = useState(0);
  const touchX = useRef<number | null>(null);

  const t = STRINGS[lang];
  const meta = CARD_META[idx];
  const card = t.cards[idx];
  const last = idx === CARD_META.length - 1;

  // The chip cycles through the six languages.
  const nextLang = () => {
    const i = LOCALES.indexOf(lang);
    setLang(LOCALES[(i + 1) % LOCALES.length]);
  };

  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 45) return;
    const max = CARD_META.length - 1;
    if (dx < 0 && idx < max) setIdx(idx + 1);
    else if (dx > 0 && idx > 0) setIdx(idx - 1);
  }

  return (
    <div>
      <div className={styles.phone} aria-label="Live demo of a SwipenDone guide">
        <div className={styles.screen}>
          <div className={styles.dHead}>
            <div className={styles.dBrand}>NORDHOLM</div>
            <button className={styles.dLang} onClick={nextLang} aria-label="Cycle demo language" style={{ fontFamily: bodyFont(lang) }}>
              🌐 {LOCALE_LABELS[lang]}
            </button>
          </div>
          <div className={styles.dProg}>
            {CARD_META.map((_, i) => (
              <span key={i} className={i <= idx ? styles.on : undefined} />
            ))}
          </div>
          <div className={styles.dBody} style={{ fontFamily: bodyFont(lang) }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {meta.tag ? (
              <div className={styles.dTag}>
                <b>{String(meta.tag[0]).padStart(2, "0")}</b>
                <i>/ {String(meta.tag[1]).padStart(2, "0")}</i>
              </div>
            ) : (
              <div style={{ height: 6 }} />
            )}
            <div className={styles.dArt} dangerouslySetInnerHTML={{ __html: ART[meta.art] }} />
            <div className={styles.dTitle} style={{ fontFamily: dispFont(lang) }}>{card.title}</div>
            <div className={styles.dText}>{card.text}</div>
            {card.tip && (
              <div className={styles.dTip}>
                <b>{t.tip}</b>
                <p>{card.tip}</p>
              </div>
            )}
            <div className={styles.dNavi}>
              {idx > 0 && (
                <button className={styles.dBack} onClick={() => setIdx(idx - 1)}>← {t.back}</button>
              )}
              <button className={styles.dNext} onClick={() => setIdx(last ? 0 : idx + 1)}>
                {card.cta ? card.cta : last ? t.again : t.next} →
              </button>
            </div>
            <div className={styles.dDiag}>🛟 {t.diag}</div>
          </div>
        </div>
      </div>
      <p className={styles.dHint}>← swipe · tap 🌐 to change language · scan-to-open, no app →</p>
    </div>
  );
}
