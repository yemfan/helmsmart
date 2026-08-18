/**
 * What a generation costs, in credits — the single source of truth.
 *
 * Deliberately dependency-free (no `server-only`, no fal, no Supabase) so both
 * sides can read it: the generation pipeline that actually charges the credits,
 * and the public marketing pages that quote the price. Those two disagreeing is
 * the failure this module exists to prevent — a repricing that updates the
 * charge but not the pricing page is quoting customers a number we don't honour.
 */
export const CREDIT_COST = {
  /** A plain text-to-image render. */
  image: 1,
  /** An edit / restyle — i.e. a render with a reference image. */
  edit: 2,
  /** A cinematic video clip. */
  video: 20,
  /**
   * Upscaling an existing clip so it clears a model's resolution floor. No
   * generation happens — it is a single pass over frames the user already has,
   * so it is priced well under a fresh clip.
   */
  upscale: 5,
} as const;
