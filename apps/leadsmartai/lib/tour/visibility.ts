/**
 * Is this element actually on screen, or only in the DOM?
 *
 * The tour lit the wrong row because of the difference. The sidebar collapses a
 * submenu with the grid trick — a wrapper of `height: 0; overflow: hidden`
 * animating `grid-template-rows` — and a link inside a collapsed wrapper still
 * reports a full 32px box AND `checkVisibility()` still returns true. It is
 * laid out; it is simply clipped to nothing by an ancestor.
 *
 * So the spotlight measured a box the viewer could not see, and drew a halo
 * over whatever happened to occupy that space — one row down, a different
 * assistant, while the bubble talked about the Receptionist.
 *
 * The only thing that gives it away is the clipping ancestor: an element with
 * `overflow` other than visible whose own box has collapsed. Comparing the two
 * rectangles is pure geometry, so it can be tested without a browser; the DOM
 * walk that collects the ancestors lives in the component.
 */

export type Box = { top: number; left: number; width: number; height: number };

export function hasArea(box: Box): boolean {
  return box.width > 0 && box.height > 0;
}

/** Do these two rectangles share any area at all? */
export function rectsOverlap(a: Box, b: Box): boolean {
  return (
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height
  );
}

/**
 * Has an ancestor clipped this element out of existence?
 *
 * @param element the candidate's own box.
 * @param clippers boxes of the ancestors that clip (overflow not `visible`),
 *   nearest first — order does not matter, any one of them can hide it.
 */
export function isClippedAway(element: Box, clippers: Box[]): boolean {
  if (!hasArea(element)) return true;
  return clippers.some((c) => !hasArea(c) || !rectsOverlap(element, c));
}

/**
 * The whole test, given what the DOM reported.
 *
 * Kept separate from the walk so the rule is one readable expression, and so a
 * future "is it scrolled out of the viewport" clause has an obvious home.
 */
export function isAnchorUsable(element: Box | null, clippers: Box[]): boolean {
  if (!element) return false;
  return !isClippedAway(element, clippers);
}
