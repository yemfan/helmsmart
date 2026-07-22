/**
 * Single source of truth for the Threads API host + version.
 *
 * Threads is a Meta product but has its OWN API host (graph.threads.net) and
 * its own OAuth server (threads.net) — distinct from the Facebook Graph API
 * (graph.facebook.com) used for Pages + Instagram. A Facebook Page token can't
 * post to Threads; the account authorizes Threads separately. See
 * lib/leads-gen/threads-oauth.ts.
 *
 * Version is env-overridable so a bump is a config change, not a deploy —
 * same pattern as lib/meta/graph.ts. Recheck ANNUALLY:
 * https://developers.facebook.com/docs/threads/changelog
 */
export const THREADS_GRAPH_VERSION =
  process.env.THREADS_GRAPH_VERSION?.trim() || "v1.0";

/** REST base, e.g. https://graph.threads.net/v1.0 */
export const THREADS_GRAPH_BASE = `https://graph.threads.net/${THREADS_GRAPH_VERSION}`;

/** OAuth token host (no version prefix on the token endpoints). */
export const THREADS_GRAPH_HOST = "https://graph.threads.net";

/** OAuth authorize dialog — hosted on threads.net, NOT facebook.com. */
export const THREADS_OAUTH_AUTHORIZE = "https://threads.net/oauth/authorize";
