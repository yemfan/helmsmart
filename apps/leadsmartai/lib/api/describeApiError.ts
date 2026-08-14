/**
 * Turn anything thrown inside a route handler into an honest, useful response.
 *
 * Routes across this app end in `e instanceof Error ? e.message : "Server error"`.
 * That check fails for the most common failure we actually hit: supabase-js
 * rejects with a PostgrestError, which is a plain object, not an Error. The
 * result is a bare "Server error" with no log line — the user is told nothing
 * and neither are we.
 *
 * Two rules here:
 *   1. Never lose the detail. The caller logs the full error server-side.
 *   2. Never blame the user for our outage. A 503 from PostgREST (connection
 *      saturation) is transient and retryable; saying "Server error" next to a
 *      form field reads as "your input was rejected", which is false.
 */

export type ApiFailure = { message: string; status: number };

/**
 * Signals that the request failed for capacity/transport reasons rather than
 * anything about the data. Matched against the message text because the shape
 * differs by layer (PostgREST JSON body, gateway HTML, undici fetch failure).
 */
const TRANSIENT =
  /\b(503|502|504)\b|service unavailable|temporarily unavailable|timeout|timed out|too many (connections|clients)|remaining connection slots|overload|fetch failed|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i;

/** Pull a human-readable string out of an Error, a PostgrestError, or a string. */
function extractMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const message = (e as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "";
}

/** Everything we know about the failure, for the server log — never the user. */
export function serializeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}\n${e.stack ?? ""}`;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function describeApiError(e: unknown, fallback = "Something went wrong on our end."): ApiFailure {
  const raw = extractMessage(e);

  if (raw && TRANSIENT.test(raw)) {
    // 503 means the write never landed, so "wasn't saved" is a statement of
    // fact, not a hedge — and it tells them the retry is worth trying.
    return {
      message: "CloseBoss was briefly overloaded, so your changes weren't saved. Try again in a moment.",
      status: 503,
    };
  }

  // A PostgREST message ("duplicate key value violates...") is imperfect but
  // far more actionable than "Server error", and the full detail is in the log.
  return { message: raw ? raw.slice(0, 300) : fallback, status: 500 };
}
