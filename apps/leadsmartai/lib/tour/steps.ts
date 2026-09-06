/**
 * The guided tour's stops.
 *
 * Anchored to elements that already exist rather than to markup added for the
 * tour: the sidebar is `PremiumSidebarV2` from `@repo/ui`, shared with the other
 * apps, and threading tour attributes through a shared component to serve one
 * app's onboarding is the wrong trade. An `href` is a stable, meaningful handle
 * — if a nav item's route changes, the step should be revisited anyway.
 *
 * Steps whose anchor is not on the page are skipped rather than shown pointing
 * at nothing: the sidebar is filtered by role, so a broker and an agent do not
 * see the same items, and a tour that stalls on a missing target is worse than
 * a shorter tour.
 *
 * Pure, so the ordering and the skipping can be tested without a browser.
 */

export type TourPlacement = "right" | "bottom" | "left" | "top";

export type TourStep = {
  id: string;
  /** CSS selector for the element this step points at. */
  selector: string;
  /** i18n keys under `pages.tour.steps.<id>`. */
  titleKey: string;
  bodyKey: string;
  placement: TourPlacement;
};

const step = (id: string, selector: string, placement: TourPlacement): TourStep => ({
  id,
  selector,
  placement,
  titleKey: `pages.tour.steps.${id}.title`,
  bodyKey: `pages.tour.steps.${id}.body`,
});

/**
 * Ordered the way someone actually starts working: ask for something, see what
 * came back, then the book it came from — rather than in sidebar order.
 */
export const TOUR_STEPS: TourStep[] = [
  step("askMax", 'a[href="/dashboard/boss"]', "right"),
  step("conversations", 'a[href="/dashboard/inbox"]', "right"),
  step("leads", 'a[href="/dashboard/contacts"]', "right"),
  step("tasks", 'a[href="/dashboard/tasks"]', "right"),
  // The receptionist route looks like the obvious anchor and is a trap: it is
  // the Overview link INSIDE the Receptionist submenu, which stays in the DOM
  // with a full-size box while collapsed. "Manage AI Team" is a top-level row
  // that is always really there.
  step("aiTeam", 'a[href="/dashboard/ai-team"]', "right"),
  step("quickActions", '[data-tour="quick-actions"]', "bottom"),
  // Last, because it is the one people find on their own — but it holds the
  // help guides and billing, so leaving it out made the tour feel incomplete.
  step("account", '[data-tour="account-menu"]', "bottom"),
];

/**
 * Drop the steps whose anchor is not on this page.
 *
 * @param isPresent asked once per step; the caller supplies the DOM lookup so
 *   this stays testable.
 */
export function visibleSteps(
  steps: TourStep[],
  isPresent: (selector: string) => boolean,
): TourStep[] {
  return steps.filter((s) => isPresent(s.selector));
}

export const TOUR_STORAGE_KEY = "closeboss.tour.v1";

/**
 * Fired to reopen the tour on demand. An event rather than a `?tour=1` reload:
 * restarting a tour should not cost a page load, and the menu item that fires
 * it can then live anywhere without knowing where the tour is mounted.
 */
export const TOUR_START_EVENT = "closeboss:start-tour";

/**
 * Should the tour open by itself?
 *
 * Only for someone who has not seen it and has not asked for it — and never
 * when there is nothing to point at, which is the state a signed-out or
 * half-rendered page is in.
 */
export function shouldAutoStart(args: {
  seen: boolean;
  requested: boolean;
  availableStepCount: number;
}): boolean {
  if (args.availableStepCount === 0) return false;
  // Opt-in only. The tour used to open itself on the first dashboard visit,
  // right after Max's welcome and on top of the setup wizard — three guides
  // in one session. It now waits to be asked (?tour=1 or the account menu).
  return args.requested;
}
