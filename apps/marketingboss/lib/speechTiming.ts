/**
 * How long a spoken line takes to say.
 *
 * Deliberately its own module with NO `server-only` import: the planner needs
 * it on the server, and the plan editor needs the identical number in the
 * browser while you type. Living in adBlueprint.ts (which is server-only)
 * meant importing it from a Client Component pulled `server-only` into the
 * browser bundle and broke the build — a boundary `tsc --noEmit` cannot see.
 *
 * Keep this file pure: no I/O, no env, no server imports.
 */

/** Unhurried delivery to camera. */
export const SPOKEN_WORDS_PER_SEC = 2.6;

/** Roughly how long a line takes to say, in seconds. */
export function estimateSpeechSeconds(line: string): number {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return words / SPOKEN_WORDS_PER_SEC;
}

/**
 * Spoken shots whose line cannot be said in the seconds it was written for.
 *
 * A scene shot is rendered to a requested duration, but an avatar shot is only
 * as long as its audio — Fabric drives a portrait with a voice track and stops
 * when the voice does. So an over-long line is not cut off; it silently
 * stretches the finished ad past the length the plan promised, and the pacing
 * that made the reference work goes with it.
 *
 * Flagged at 1.3x rather than 1.0 because the estimate is rough and a small
 * overrun is unnoticeable.
 */
export function findOverrunningShots(
  shots: ReadonlyArray<{ index: number; render: string; line: string; seconds: number }>,
): Array<{ index: number; needed: number; have: number }> {
  return shots
    .filter((s) => s.render === "avatar" && s.line)
    .map((s) => ({ index: s.index, needed: estimateSpeechSeconds(s.line), have: s.seconds }))
    .filter((s) => s.needed > s.have * 1.3);
}
