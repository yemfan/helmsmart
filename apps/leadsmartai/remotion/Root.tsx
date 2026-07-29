// @ts-nocheck — Remotion composition source; see CarouselReel.tsx. Built by the
// Remotion CLI/Lambda bundler, not the Next app, so it's opted out of Next's TS pass.
import { Composition } from "remotion";

import {
  CarouselReel,
  FRAMES_PER_SLIDE,
  REEL_FPS,
  REEL_HEIGHT,
  REEL_WIDTH,
  type CarouselReelProps,
} from "./CarouselReel";

/**
 * Remotion composition registry. One composition, "CarouselReel"; its duration
 * is derived from the number of slides via calculateMetadata so a 5-slide deck
 * is 20s and a 4-slide deck is 16s. Real slides are injected as inputProps at
 * render time (renderMediaOnLambda); the defaults just make the Studio preview
 * useful.
 */
export function RemotionRoot() {
  return (
    <Composition<Record<string, unknown>, CarouselReelProps>
      id="CarouselReel"
      component={CarouselReel}
      fps={REEL_FPS}
      width={REEL_WIDTH}
      height={REEL_HEIGHT}
      durationInFrames={5 * FRAMES_PER_SLIDE}
      defaultProps={{
        slides: [
          { heading: "3 texts that revive a dead lead", body: "Save this for the ones who ghosted." },
          { heading: "1. The soft nudge", body: "“Still keeping an eye on the market?”" },
          { heading: "2. The value drop", body: "Send one thing they didn't ask for but will use." },
          { heading: "3. The direct ask", body: "“Want me to pull three that just hit?”" },
          { heading: "You won't send all three at 9pm.", body: "Your AI assistant will." },
        ],
      }}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(1, props.slides?.length ?? 1) * FRAMES_PER_SLIDE,
      })}
    />
  );
}
