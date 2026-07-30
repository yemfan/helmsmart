import { ImageResponse } from "next/og";

import type { ScamTree } from "./scamTrees";

/**
 * Branded decision-tree image ad (next/og / satori). Renders an AVASC
 * "Could this be a scam?" flowchart: eyebrow → 2-line headline → a top decision
 * node → two red-flag branch nodes → a gold CTA pill → footer.
 *
 * Satori gotchas (learned the hard way in the CloseBoss ad engine):
 *  - Every element with MORE THAN ONE child must set `display: "flex"`.
 *  - No React Fragments inside the tree (satori throws "Cannot convert a Symbol
 *    value to a string") — build with plain nested divs / keyed arrays.
 *  - The base font has no emoji and no ▲▼ glyphs (they render as tofu); only
 *    `↑ ↓ → ·` are safe. So: no shield emoji, arrows are "↓".
 */

export type AdFormat = "square" | "portrait";

const NAVY = "#0B1E3F";
const PANEL = "#10294F";
const GOLD = "#F4B740";
const WHITE = "#FFFFFF";
const MUTED = "#9DB4DC";
const FAINT = "#5E77A8";
const BORDER = "#2C4E86";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const DIMS: Record<AdFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
};

function Node({ text, maxWidth }: { text: string; maxWidth: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: PANEL,
        border: `3px solid ${BORDER}`,
        borderRadius: 60,
        padding: "20px 30px",
        maxWidth,
      }}
    >
      <div style={{ color: WHITE, fontSize: 32, fontWeight: 700, lineHeight: 1.15, textAlign: "center" }}>
        {text}
      </div>
    </div>
  );
}

function DownYes() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ color: MUTED, fontSize: 38, lineHeight: 1 }}>↓</div>
      <div style={{ color: MUTED, fontSize: 20, fontWeight: 800, letterSpacing: 2 }}>YES</div>
    </div>
  );
}

/** Build the ImageResponse for one scam decision tree. */
export function buildScamTreeAd(tree: ScamTree, format: AdFormat = "square"): ImageResponse {
  const { w, h } = DIMS[format];

  const element = (
    <div
      style={{
        width: w,
        height: h,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        backgroundColor: NAVY,
        fontFamily: FONT,
        padding: "60px 56px",
      }}
    >
      {/* eyebrow */}
      <div style={{ display: "flex", color: GOLD, fontSize: 28, fontWeight: 700, letterSpacing: 8 }}>
        {tree.eyebrow}
      </div>

      {/* headline */}
      <div style={{ display: "flex", color: WHITE, fontSize: 68, fontWeight: 800, marginTop: 24, textAlign: "center" }}>
        {tree.headline}
      </div>
      <div style={{ display: "flex", color: GOLD, fontSize: 92, fontWeight: 900, lineHeight: 1.05, marginBottom: 30, textAlign: "center" }}>
        {tree.headlineAccent}
      </div>

      {/* top node */}
      <Node text={tree.nodeTop} maxWidth={640} />

      {/* fork arrows */}
      <div style={{ display: "flex", width: "100%", justifyContent: "space-around", padding: "12px 140px" }}>
        <DownYes />
        <DownYes />
      </div>

      {/* branch nodes */}
      <div style={{ display: "flex", width: "100%", justifyContent: "center", gap: 28 }}>
        <div style={{ display: "flex", flex: 1, justifyContent: "center" }}>
          <Node text={tree.nodeLeft} maxWidth={440} />
        </div>
        <div style={{ display: "flex", flex: 1, justifyContent: "center" }}>
          <Node text={tree.nodeRight} maxWidth={440} />
        </div>
      </div>

      {/* converge */}
      <div style={{ display: "flex", color: MUTED, fontSize: 44, padding: "14px 0" }}>↓</div>

      {/* CTA */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: GOLD,
          borderRadius: 60,
          padding: "26px 44px",
          maxWidth: 720,
        }}
      >
        <div style={{ color: NAVY, fontSize: 42, fontWeight: 800, textAlign: "center" }}>{tree.cta}</div>
      </div>

      {/* footer */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "auto" }}>
        <div style={{ display: "flex", color: MUTED, fontSize: 26, fontWeight: 600 }}>
          Free scam check · No login needed
        </div>
        <div style={{ display: "flex", color: FAINT, fontSize: 22, fontWeight: 500, marginTop: 6 }}>
          AVASC · Association of Victims Against Cyber-Scams
        </div>
      </div>
    </div>
  );

  return new ImageResponse(element, {
    width: w,
    height: h,
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}

/** Rasterise a scam-tree ad to PNG bytes (for cron-time render → storage upload). */
export async function renderScamTreePng(tree: ScamTree, format: AdFormat = "square"): Promise<Uint8Array> {
  const res = buildScamTreeAd(tree, format);
  return new Uint8Array(await res.arrayBuffer());
}
