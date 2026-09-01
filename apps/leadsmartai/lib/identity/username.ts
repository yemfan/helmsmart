/**
 * The agent's username — one handle, several jobs.
 *
 * It is not a page slug. It is an identity that will appear in places with
 * very different rules, and the strictest of them has to win everywhere:
 *
 *   a public URL      closebossai.com/@michaelye
 *   an email address  michaelye@closebossai.com   (forwarding, later)
 *   a display handle  @michaelye
 *
 * That combination is why the rules below are tighter than a URL alone would
 * need, and why the whole thing is worth getting right on the first pass: a
 * username is close to impossible to take back. Someone prints it on a business
 * card, a client emails it, Google indexes it. Renaming later breaks links and
 * — if mail is live by then — silently misroutes messages to whoever claims the
 * freed name next.
 *
 * DECISIONS AND WHY
 *
 * Stored WITHOUT the "@". The sigil is display, not data; storing it would put
 * it in the email local part and every URL twice over.
 *
 * No dots. Legal in a URL and in an email local part, but Gmail folds them
 * (m.ichaelye reaches michaelye), so two people could believe they own
 * different mailboxes that deliver to one inbox. Also invites confusion with
 * subdomains.
 *
 * Lowercase only. Email local parts are technically case-sensitive; nobody
 * treats them that way. Case-preserving storage would let @MichaelYe and
 * @michaelye both exist and be indistinguishable in practice.
 *
 * Starts and ends alphanumeric. A leading or trailing hyphen breaks in enough
 * mail and DNS tooling to not be worth supporting.
 *
 * 3 to 30. Short enough to say aloud, long enough for a real name plus a
 * qualifier. The floor keeps the shortest, most contested handles from being
 * taken in the first week.
 *
 * Pure — no I/O — so the same rules run in the signup form, the API and the
 * tests. Availability is a database question and lives elsewhere.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

/** Mirrors the CHECK constraint on `agents.username`. Keep the two in step. */
export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28})[a-z0-9]$/;

export type UsernameProblem =
  | "empty"
  | "too_short"
  | "too_long"
  | "bad_characters"
  | "bad_edges"
  | "reserved";

/**
 * Names nobody may take.
 *
 * Three kinds, all of them for the same reason — a username that reaches an
 * inbox or a URL can impersonate:
 *
 *   1. mail infrastructure (RFC 2142 and friends). `postmaster` and `abuse`
 *      are required to reach a human at the domain; handing them to an agent
 *      would break that obligation.
 *   2. the company and its AI staff. @support and @max must mean us, always.
 *      This is the anti-phishing entry — "@billing emailed me about my card"
 *      has to be false by construction.
 *   3. structural words. Reserved so the URL space stays open: if a bare
 *      /username is ever wanted, or a subdomain, these must not already belong
 *      to someone.
 *
 * A list, not a table, because it is enforced in the database too and the two
 * must not drift. It is short and stable; when it needs to grow it grows in
 * both places together.
 *
 * Nothing here is shorter than USERNAME_MIN. Two-letter names like `ai` and
 * `mx` are already unreachable by the length rule, and listing them would
 * imply a protection the list is not providing. If the minimum ever drops,
 * they have to be added back deliberately.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  // 1 — mail infrastructure
  "postmaster", "abuse", "hostmaster", "webmaster", "mailer-daemon", "daemon",
  "noreply", "no-reply", "donotreply", "do-not-reply", "bounce", "bounces",
  "mail", "email", "smtp", "imap", "root", "ssl-admin",
  // 2 — the company and its AI staff
  "closeboss", "closebossai", "close-boss", "leadsmart", "leadsmartai",
  "helmsmart", "propertytools", "propertytoolsai", "marketingboss", "realtyboss",
  "support", "help", "billing", "sales", "security", "legal", "privacy",
  "team", "staff", "official", "admin", "administrator", "moderator", "mod",
  "max", "emma", "ruby", "nina", "lucy", "boss", "assistant",
  // 3 — structural
  "api", "www", "app", "web", "cdn", "static", "assets", "auth", "login",
  "logout", "signup", "signin", "register", "account", "accounts", "settings",
  "dashboard", "agent", "agents", "broker", "brokers", "client", "clients",
  "blog", "about", "contact", "pricing", "plans", "terms", "status", "docs",
  "home", "search", "new", "edit", "delete", "null", "undefined", "true", "false",
]);

/** Strip the sigil, trim, lowercase. What the form should call on every keystroke. */
export function normalizeUsername(raw: string | null | undefined): string {
  return String(raw ?? "").trim().replace(/^@+/, "").toLowerCase();
}

/** Display form. The "@" lives here and nowhere else. */
export function displayUsername(username: string | null | undefined): string {
  const u = normalizeUsername(username);
  return u ? `@${u}` : "";
}

/**
 * @returns null when the name is usable, or the first reason it is not.
 *   Order matters: report the specific fault (too short) before the generic
 *   one (bad characters), so the message can tell the user what to change.
 */
export function checkUsername(raw: string | null | undefined): UsernameProblem | null {
  const u = normalizeUsername(raw);
  if (!u) return "empty";
  if (u.length < USERNAME_MIN) return "too_short";
  if (u.length > USERNAME_MAX) return "too_long";
  if (/[^a-z0-9_-]/.test(u)) return "bad_characters";
  if (!USERNAME_PATTERN.test(u)) return "bad_edges";
  if (RESERVED_USERNAMES.has(u)) return "reserved";
  return null;
}

/** Whether this name is usable, ignoring whether it is already taken. */
export function isValidUsername(raw: string | null | undefined): boolean {
  return checkUsername(raw) === null;
}

/**
 * What to show the person typing.
 *
 * Written as a fix, not a verdict — the field is the first thing a new agent
 * touches and "invalid username" tells them nothing about what to do next.
 */
export function usernameProblemMessage(problem: UsernameProblem): string {
  switch (problem) {
    case "empty":
      return "Pick a username — this becomes your public link.";
    case "too_short":
      return `Usernames need at least ${USERNAME_MIN} characters.`;
    case "too_long":
      return `Usernames can be up to ${USERNAME_MAX} characters.`;
    case "bad_characters":
      return "Letters, numbers, hyphens and underscores only — no spaces, dots or symbols.";
    case "bad_edges":
      return "Start and end with a letter or number.";
    case "reserved":
      return "That one is reserved. Try adding your city or last name.";
  }
}

/**
 * A first suggestion, built from whatever the agent already told us.
 *
 * Deliberately not unique — availability is a database question. This just
 * saves the person from an empty box, which is where signup flows lose people.
 */
export function suggestUsername(parts: {
  brandName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const source =
    [parts.firstName, parts.lastName].filter(Boolean).join(" ") ||
    parts.brandName ||
    "";
  const base = source
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, USERNAME_MAX);
  return isValidUsername(base) ? base : "";
}
