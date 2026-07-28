import {
  AbsoluteFill,
  interpolate,
  Series,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/**
 * CarouselReel — a vertical (1080×1920) short-video version of a CloseBoss
 * carousel (reach Phase 3b). Each slide of the deck becomes a ~4s scene with a
 * fade+rise entrance and a top progress bar, on the cohesive CloseBoss navy so
 * the whole thing reads as one branded Reel rather than a slideshow.
 *
 * This is the RENDER DESCRIPTION only. Production rendering runs on Remotion
 * Lambda (a Vercel function can't encode video); the app triggers a render and
 * publishes the resulting MP4 as a Reel / FB video / LinkedIn video.
 */

export type ReelSlide = { heading: string; body: string };
export type CarouselReelProps = { slides: ReelSlide[] };

const NAVY = "#0B1F44";
const NAVY_2 = "#0a1730";
const GOLD = "#DAA017";
const ACCENT = "#0072ce";
const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

/** Frames per slide at 30fps → 4s each. Root derives total duration from this. */
export const FRAMES_PER_SLIDE = 120;
export const REEL_FPS = 30;
export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;

export function CarouselReel({ slides }: CarouselReelProps) {
  const safe = Array.isArray(slides) && slides.length > 0 ? slides : [{ heading: "CloseBoss", body: "" }];
  const total = safe.length;
  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${NAVY} 0%, ${NAVY_2} 100%)`,
        fontFamily: FONT,
      }}
    >
      <Series>
        {safe.map((slide, i) => (
          <Series.Sequence key={i} durationInFrames={FRAMES_PER_SLIDE}>
            <Slide slide={slide} index={i} total={total} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
}

function Slide({ slide, index, total }: { slide: ReelSlide; index: number; total: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kind = index === 0 ? "cover" : index === total - 1 ? "close" : "point";

  // Fade + rise entrance.
  const enter = spring({ frame, fps, config: { damping: 200, mass: 0.6 } });
  const translateY = interpolate(enter, [0, 1], [60, 0]);
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });

  // Slide's share of the overall progress bar, filling across its 4s.
  const localFill = interpolate(frame, [0, FRAMES_PER_SLIDE], [0, 1], {
    extrapolateRight: "clamp",
  });
  const progress = (index + localFill) / total;

  return (
    <AbsoluteFill style={{ padding: "120px 96px", justifyContent: "center" }}>
      {/* top: brand + counter */}
      <div
        style={{
          position: "absolute",
          top: 96,
          left: 96,
          right: 96,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 800, color: GOLD, letterSpacing: 1 }}>CloseBoss</div>
        <div style={{ fontSize: 34, fontWeight: 600, color: "#94a3b8" }}>
          {index + 1} / {total}
        </div>
      </div>

      {/* progress bar */}
      <div style={{ position: "absolute", top: 168, left: 96, right: 96, height: 8, borderRadius: 999, background: "#1e3a5f" }}>
        <div style={{ width: `${Math.round(progress * 100)}%`, height: "100%", borderRadius: 999, background: GOLD }} />
      </div>

      {/* body */}
      <div style={{ transform: `translateY(${translateY}px)`, opacity, display: "flex", flexDirection: "column" }}>
        {kind === "cover" && (
          <div style={{ width: 120, height: 12, borderRadius: 999, background: GOLD, marginBottom: 48 }} />
        )}
        <div
          style={{
            fontSize: kind === "cover" ? 128 : 104,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: -2,
            color: "#ffffff",
          }}
        >
          {slide.heading}
        </div>
        {slide.body ? (
          <div style={{ fontSize: 56, fontWeight: 500, lineHeight: 1.3, color: "#cbd5e1", marginTop: 44 }}>
            {slide.body}
          </div>
        ) : null}
        {kind === "close" && (
          <div style={{ fontSize: 44, fontWeight: 800, color: ACCENT, marginTop: 56 }}>closebossai.com</div>
        )}
        {kind === "cover" && (
          <div style={{ fontSize: 44, fontWeight: 700, color: ACCENT, marginTop: 56 }}>Keep watching →</div>
        )}
      </div>
    </AbsoluteFill>
  );
}
