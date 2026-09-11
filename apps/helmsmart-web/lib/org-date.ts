/**
 * "Today" for the organization, and calendar math on `YYYY-MM-DD` strings.
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC date, and servers run in
 * UTC. From 5 PM Pacific / 8 PM Eastern it is already tomorrow there, so a new
 * invoice was issued a day early, its 30-day due date landed a day late, and
 * every `due_date < today` overdue check flagged invoices a day before they
 * were due. The business's day is the one in `organizations.timezone`.
 *
 * PURE ON PURPOSE, like `./books-format`: no Supabase, no `server-only`. Client
 * forms import `calendarDate` with the timezone the page passed down as a prop;
 * `orgTimezone()` in `./org-timezone` is the server half that reads the column.
 *
 * Everything after `calendarDate` works on the date string itself, anchored at
 * UTC noon/midnight only as arithmetic — never through `setDate` on a local
 * Date followed by `toISOString()`, which shifts the result a day in any zone
 * that is not UTC.
 */

/** What `organizations.timezone` defaults to in the schema and the settings form. */
export const DEFAULT_ORG_TIMEZONE = "America/New_York";

/**
 * The calendar date (`YYYY-MM-DD`) it is in `timeZone` at instant `at`.
 *
 * An unknown zone falls back to {@link DEFAULT_ORG_TIMEZONE} instead of
 * throwing: one typo in a settings field must not take every Books page down.
 */
export function calendarDate(timeZone: string | null | undefined, at: Date = new Date()): string {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || DEFAULT_ORG_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return calendarDate(DEFAULT_ORG_TIMEZONE, at);
  }
  // Assemble from parts rather than trusting en-CA's pattern to stay ISO-shaped.
  const p: Record<string, string> = {};
  for (const { type, value } of fmt.formatToParts(at)) p[type] = value;
  return `${p.year}-${p.month}-${p.day}`;
}

const parse = (ymd: string) => new Date(`${ymd}T00:00:00Z`);
const format = (d: Date) => d.toISOString().slice(0, 10);

/** `ymd` plus `days` (negative to go back). */
export function addDays(ymd: string, days: number): string {
  const d = parse(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** The first of `ymd`'s month, shifted by `monthOffset` months (1 = next month). */
export function firstOfMonth(ymd: string, monthOffset = 0): string {
  const d = parse(ymd);
  return format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthOffset, 1)));
}

/** The last day of `ymd`'s month. */
export function lastOfMonth(ymd: string): string {
  const d = parse(ymd);
  return format(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** The Monday on or before `ymd` — the start of a Monday–Sunday week. */
export function mondayOf(ymd: string): string {
  const dow = parse(ymd).getUTCDay(); // 0 = Sun
  return addDays(ymd, -((dow + 6) % 7));
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000);
}
