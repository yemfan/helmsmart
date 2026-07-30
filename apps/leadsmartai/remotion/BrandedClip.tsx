// @ts-nocheck — Remotion composition source (see CarouselReel.tsx). Built by the
// Remotion CLI/Lambda bundler, not the Next app, so it's opted out of Next's TS pass.
import {
  AbsoluteFill,
  OffthreadVideo,
  Series,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * BrandedClip — wraps an agent's UPLOADED video into a publish-ready vertical
 * (1080×1920) reel: a branded intro card → the clip (cropped to fill 9:16, with
 * a CloseBoss watermark) → a CTA outro card. The uploaded video is fetched by
 * URL at render time (must be publicly reachable while the Lambda runs).
 *
 * Phase 1 = brand-wrap + vertical. Captions / trim / music layer on later as
 * extra props to this same composition.
 */

export type BrandedClipProps = {
  videoUrl: string;
  /** Length of the uploaded clip in frames (computed client-side from the file's
   *  duration × fps). Root derives the total composition length from it. */
  videoDurationInFrames: number;
  hook: string; // intro card text
  cta: string; // outro card text
};

const NAVY = "#0B1F44";
const NAVY_2 = "#0a1730";
const GOLD = "#DAA017";
const ACCENT = "#0072ce";
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const CLIP_FPS = 30;
export const CLIP_WIDTH = 1080;
export const CLIP_HEIGHT = 1920;
export const INTRO_FRAMES = 60; // 2s
export const OUTRO_FRAMES = 60; // 2s

export function BrandedClip({ videoUrl, videoDurationInFrames, hook, cta }: BrandedClipProps) {
  const vid = Math.max(1, Math.round(videoDurationInFrames || CLIP_FPS * 5));
  return (
    <AbsoluteFill style={{ background: NAVY, fontFamily: FONT }}>
      <Series>
        <Series.Sequence durationInFrames={INTRO_FRAMES}>
          <Card kind="intro" text={hook || "Watch this →"} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={vid}>
          <VideoScene src={videoUrl} />
        </Series.Sequence>
        <Series.Sequence durationInFrames={OUTRO_FRAMES}>
          <Card kind="outro" text={cta || "Your AI real estate team."} />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
}

function VideoScene({ src }: { src: string }) {
  return (
    <AbsoluteFill style={{ background: "#000000" }}>
      <OffthreadVideo src={src} style={{ width: CLIP_WIDTH, height: CLIP_HEIGHT, objectFit: "cover" }} />
      {/* watermark */}
      <div style={{ position: "absolute", bottom: 64, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: 0.5, color: "#ffffff", background: "rgba(11,31,68,0.78)", padding: "12px 28px", borderRadius: 999 }}>
          <span>CLOSE</span>
          <span style={{ color: GOLD }}>BOSS</span>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Card({ kind, text }: { kind: "intro" | "outro"; text: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const ty = interpolate(enter, [0, 1], [50, 0]);
  const op = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_2} 100%)`, justifyContent: "center", alignItems: "center", padding: "0 96px" }}>
      <div style={{ transform: `translateY(${ty}px)`, opacity: op, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ width: 120, height: 12, borderRadius: 999, background: GOLD, marginBottom: 48 }} />
        <div style={{ fontSize: 104, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: "#ffffff", textAlign: "center" }}>{text}</div>
        {kind === "outro" ? (
          <div style={{ fontSize: 44, fontWeight: 800, color: ACCENT, marginTop: 56 }}>closebossai.com</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}
