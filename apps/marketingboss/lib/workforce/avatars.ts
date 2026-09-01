/**
 * Worker → portrait mapping, isolated so the art set can be replaced without
 * touching a single component. Swapping in a new set of avatars means editing
 * PORTRAIT (and dropping the files in `public/avatars/personas/`) — nothing else.
 *
 * Current set: six bespoke MarketingBoss portraits that happen to share
 * filenames with the CloseBoss cast (different artwork — verified by checksum).
 * Each was assigned the role its prop already reads as: Emma wears a headset,
 * Grace and Oliver wear glasses, Ruby is the high-energy one, Max is the calm
 * one in the dark turtleneck, Chris is the youthful one in a hoodie.
 *
 * KNOWN ART DEBT (see the 3.0 assessment, D5): four of the six are off-centre
 * with dead space on the right, all carry a faint vertical seam along the right
 * edge, and two have garbled generated text baked in — `grace` reads "ATOR",
 * `max` has a stray partial letter. They hold up at rail size (32-40px) and
 * will not hold up in a Phase 2 sidebar or any hero treatment. Re-crop all six
 * and regenerate `grace` before promoting them.
 *
 * MISSING: Nina and Leo have no portrait yet. `portraitUrl` returns null for
 * them, and callers fall back to initials — deliberately, so a missing face is
 * visibly missing rather than silently wrong. Generate both in the app's own
 * Character Studio (lib/characters.ts) to match the existing style.
 *
 * Pure/client-safe.
 */

import type { WorkerId } from "./workers";

/** Portrait file stem per worker, or null where no art exists yet. */
const PORTRAIT: Record<WorkerId, string | null> = {
  nina: null, // TODO: generate in Character Studio
  strategy_director: "max",
  market_researcher: "oliver",
  trend_scout: "ruby",
  content_creator: "chris",
  video_producer: null, // TODO: generate in Character Studio
  social_manager: "emma",
  performance_analyst: "grace",
  brand_guardian: null, // deliberately faceless — a gate, not a colleague
};

const BASE = "/avatars/personas";

/** Public URL for a worker's portrait, or null when it should fall back to initials. */
export function portraitUrl(id: WorkerId): string | null {
  const stem = PORTRAIT[id];
  return stem ? `${BASE}/${stem}.png` : null;
}

/** True when every worker that should have a face has one. Useful in a smoke check. */
export function portraitsComplete(ids: readonly WorkerId[]): boolean {
  return ids.every((id) => PORTRAIT[id] !== null);
}
