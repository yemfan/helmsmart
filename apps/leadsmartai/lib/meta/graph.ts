/**
 * Single source of truth for the Meta Graph API version.
 *
 * Meta deprecates a Graph version roughly TWO YEARS after release, after which
 * calls stop behaving predictably. This constant used to be hardcoded in three
 * places and had drifted apart — the publisher was on v21.0 while the OAuth
 * connect flow and a second (now-deleted) Facebook publisher were still pinned
 * to v19.0. v19.0 shipped Jan 2024, so it was already past its 2-year window —
 * exactly the class of breakage that hit LinkedIn (stale version → HTTP 426).
 *
 * Bump via the META_GRAPH_VERSION env var so a version change is a config
 * change, not a deploy. Recheck ANNUALLY:
 * https://developers.facebook.com/docs/graph-api/changelog
 */
export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION?.trim() || "v21.0";

/** REST base, e.g. https://graph.facebook.com/v21.0 */
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** OAuth consent dialog, e.g. https://www.facebook.com/v21.0/dialog/oauth */
export const META_OAUTH_DIALOG = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
