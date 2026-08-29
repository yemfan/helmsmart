/**
 * Who is on the page, before we know who they are.
 *
 * Two ids, deliberately different lifetimes:
 *
 *   visitor_id  one browser, kept for a year. Survives between visits, which
 *               is the whole point — it is what lets a form submitted in
 *               August be joined to pages read in July.
 *   session_id  one visit, 30 minutes of inactivity. Resets so "three visits
 *               over two weeks" can be told apart from "one long read".
 *
 * BOTH ARE OPAQUE AND FIRST-PARTY. They are random, carry no personal data,
 * and are readable only by this domain. They are not an identity — a shared
 * computer is one visitor id and two people, and nothing here should ever be
 * described to an agent as certainty about a person.
 *
 * The 30-minute session window matches the analytics convention (GA4 uses the
 * same), so counts here and in the agent's own GA line up rather than
 * disagreeing for reasons nobody can explain.
 *
 * Pure: no cookies, no crypto import, no I/O. The route supplies randomness
 * and the clock, so every rule below can be tested directly.
 */

export const VISITOR_COOKIE = "cb_vid";
export const SESSION_COOKIE = "cb_sid";

/** A year. Long enough to bridge a real estate decision, which is slow. */
export const VISITOR_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/** Thirty minutes of inactivity ends a session. */
export const SESSION_IDLE_MS = 30 * 60 * 1000;

/** Ids are `<random>.<lastSeenMs>` so freshness needs no second cookie. */
const ID_RE = /^[a-z0-9]{8,40}(\.\d{1,16})?$/i;

export type VisitorIds = {
  visitorId: string;
  sessionId: string;
  /** True when this request began a new session — the count of "visits". */
  isNewSession: boolean;
  /** True when we had never seen this browser before. */
  isNewVisitor: boolean;
};

/**
 * One cookie out of a raw `Cookie:` header.
 *
 * Lives here, used by both routes, because it was briefly written twice and
 * the second copy lost a backslash: `\\s` became `\s`, which a template
 * literal collapses to a plain `s`. The pattern still matched a cookie at the
 * START of the header and nothing after it — so the stitch would have worked
 * or not depending on cookie order, which is the worst way for a bug to
 * behave. One implementation, one test.
 *
 * Written without a regex at all now. There is no escaping left to get wrong.
 */
export function readCookieFromHeader(
  header: string | null | undefined,
  name: string,
): string | null {
  const jar = String(header ?? "");
  if (!jar || !name) return null;
  for (const part of jar.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      // A malformed percent-escape is not ours; treat it as absent rather
      // than throwing on a public request.
      return null;
    }
  }
  return null;
}

/** Reject anything that did not come from us. A cookie is attacker-controlled. */
export function isWellFormedId(value: string | null | undefined): boolean {
  const v = String(value ?? "").trim();
  return v.length > 0 && v.length <= 64 && ID_RE.test(v);
}

function randomPart(random: () => string): string {
  const r = random().replace(/[^a-z0-9]/gi, "").slice(0, 24);
  // A generator that returns something unusable must not produce a colliding
  // constant — every visitor would then share one id and one journey.
  return r.length >= 8 ? r : `x${Date.now().toString(36)}${Math.trunc(0).toString(36)}`;
}

function lastSeenOf(sessionId: string): number | null {
  const dot = sessionId.lastIndexOf(".");
  if (dot < 0) return null;
  const n = Number(sessionId.slice(dot + 1));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Refresh the timestamp a session id carries, without changing its identity. */
export function touchSession(sessionId: string, now: number): string {
  const dot = sessionId.lastIndexOf(".");
  const base = dot < 0 ? sessionId : sessionId.slice(0, dot);
  return `${base}.${now}`;
}

/**
 * Resolve the ids for this request from whatever the browser sent.
 *
 * @param cookies what arrived. Malformed values are treated as absent rather
 *   than trusted — a hand-edited cookie should start a clean visitor, never
 *   reach a query.
 * @param random source of the random part; the route passes crypto.
 * @param now the clock, injected so session expiry is testable.
 */
export function resolveVisitor(
  cookies: { visitorId?: string | null; sessionId?: string | null },
  random: () => string,
  now: number,
): VisitorIds {
  const priorVisitor = isWellFormedId(cookies.visitorId) ? String(cookies.visitorId) : null;
  const priorSession = isWellFormedId(cookies.sessionId) ? String(cookies.sessionId) : null;

  const visitorId = priorVisitor ?? randomPart(random);

  const lastSeen = priorSession ? lastSeenOf(priorSession) : null;
  const sessionAlive =
    priorSession !== null && lastSeen !== null && now - lastSeen < SESSION_IDLE_MS;

  return {
    visitorId,
    sessionId: sessionAlive
      ? touchSession(priorSession as string, now)
      : `${randomPart(random)}.${now}`,
    isNewSession: !sessionAlive,
    isNewVisitor: priorVisitor === null,
  };
}

// ── the journey an agent is shown ────────────────────────────────────────

export type JourneyEvent = {
  eventType: string;
  pagePath: string | null;
  source: string | null;
  campaign: string | null;
  createdAt: string;
};

export type Journey = {
  /** Page views before the enquiry — the number the agent actually reacts to. */
  viewsBeforeConverting: number;
  /** Distinct sessions, i.e. how many times they came back. */
  visits: number;
  /** Where they first arrived from. First touch, not last — it is the one that persuaded. */
  firstSource: string | null;
  firstCampaign: string | null;
  firstSeenAt: string | null;
  convertedAt: string | null;
  events: JourneyEvent[];
};

/**
 * Summarise a contact's recorded activity.
 *
 * FIRST touch, not last. By the time someone fills in a form they usually
 * arrived directly, because they typed the name they already knew — crediting
 * "direct" would hide the Facebook post that actually did the work, and that
 * misattribution is what makes agents stop trusting the numbers.
 *
 * Pure so the counting rules can be tested without a database.
 */
export function summariseJourney(
  rows: Array<{
    event_type?: unknown;
    page_path?: unknown;
    source?: unknown;
    campaign?: unknown;
    session_id?: unknown;
    created_at?: unknown;
  }>,
): Journey {
  // Carries sessionId while counting visits; it is dropped from the returned
  // shape, because a session id is ours and means nothing to an agent.
  const events: Array<JourneyEvent & { sessionId: string | null }> = rows
    .map((r) => ({
      eventType: String(r.event_type ?? "").trim(),
      pagePath: String(r.page_path ?? "").trim() || null,
      source: String(r.source ?? "").trim() || null,
      campaign: String(r.campaign ?? "").trim() || null,
      sessionId: String(r.session_id ?? "").trim() || null,
      createdAt: String(r.created_at ?? "").trim(),
    }))
    .filter((e) => e.eventType && e.createdAt)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  const conversion = events.find((e) => e.eventType === "conversion") ?? null;
  const convertedAt = conversion?.createdAt ?? null;

  const beforeConversion = convertedAt
    ? events.filter((e) => Date.parse(e.createdAt) < Date.parse(convertedAt))
    : events;

  const first = events[0] ?? null;
  const sessions = new Set(events.map((e) => e.sessionId).filter(Boolean));

  return {
    viewsBeforeConverting: beforeConversion.filter((e) => e.eventType === "page_view").length,
    // A visitor whose events predate session tracking still made one visit.
    visits: sessions.size || (events.length ? 1 : 0),
    firstSource: first?.source ?? null,
    firstCampaign: first?.campaign ?? null,
    firstSeenAt: first?.createdAt ?? null,
    convertedAt,
    events: events.map(({ eventType, pagePath, source, campaign, createdAt }) => ({
      eventType,
      pagePath,
      source,
      campaign,
      createdAt,
    })),
  };
}

/**
 * The one-line version, for a contact row.
 *
 * Returns empty rather than a hedge when there is nothing to say — "0 pages
 * from unknown" is worse than silence, because it reads as a fact about the
 * person rather than a gap in what we recorded.
 */
export function journeyHeadline(j: Journey): string {
  if (j.viewsBeforeConverting === 0 && !j.firstSource) return "";
  const pages =
    j.viewsBeforeConverting === 1 ? "1 page" : `${j.viewsBeforeConverting} pages`;
  const visits = j.visits > 1 ? ` across ${j.visits} visits` : "";
  const from = j.firstSource ? ` · first found you via ${j.firstSource}` : "";
  return `Read ${pages}${visits} before getting in touch${from}`;
}
