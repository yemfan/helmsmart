/**
 * A brokerage roster, pasted or uploaded, turned into invite rows — the pure
 * half of bulk onboarding.
 *
 * What people paste is never one shape: a CSV export with a header row, a
 * tab-separated block copied from a spreadsheet, a column of emails, or an
 * address book's "Jane Doe <jane@x.com>" lines. This finds the email in each
 * row (the one thing an invite cannot do without), takes a name and a phone
 * when a column or the line offers one, and says exactly which lines it
 * could not use and why, so the owner fixes three lines instead of guessing.
 */

export type RosterRow = { email: string; name: string | null; phone: string | null };
export type RosterProblem = { line: number; text: string; reason: "no_email" | "bad_email" | "duplicate" };
export type RosterParse = { rows: RosterRow[]; problems: RosterProblem[] };

/** Rows above this are refused so a stray file does not become 50,000 invitations. */
export const MAX_ROSTER_ROWS = 2000;

const EMAIL_RE = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[^\s@<>,;"']+$/;
const EMAIL_IN_TEXT_RE = /[^\s@<>,;"']+@[^\s@<>,;"']+\.[A-Za-z]{2,}/;

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ",") {
    // Quoted CSV cells may contain commas.
    const out: string[] = [];
    let cur = "";
    let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === "," && !q) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim().replace(/^"|"$/g, "").trim());
  }
  return line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, "").trim());
}

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 20);
  const score = (d: string) => sample.reduce((n, l) => n + (l.split(d).length - 1), 0);
  const tabs = score("\t");
  const commas = score(",");
  const semis = score(";");
  if (tabs >= commas && tabs >= semis && tabs > 0) return "\t";
  if (semis > commas) return ";";
  return ",";
}

const HEADER_WORDS: Record<"email" | "name" | "first" | "last" | "phone", RegExp> = {
  email: /^(e-?mail|email address|agent email|work email)$/i,
  name: /^(name|full name|agent|agent name|display name)$/i,
  first: /^(first|first name|given name)$/i,
  last: /^(last|last name|surname|family name)$/i,
  phone: /^(phone|mobile|cell|cell phone|mobile phone|telephone|phone number)$/i,
};

function headerMap(cells: string[]): Partial<Record<keyof typeof HEADER_WORDS, number>> | null {
  const map: Partial<Record<keyof typeof HEADER_WORDS, number>> = {};
  cells.forEach((c, i) => {
    const v = c.trim().toLowerCase();
    for (const key of Object.keys(HEADER_WORDS) as (keyof typeof HEADER_WORDS)[]) {
      if (map[key] == null && HEADER_WORDS[key].test(v)) map[key] = i;
    }
  });
  // A header row is one that names an email column and holds no email itself.
  if (map.email == null || cells.some((c) => EMAIL_IN_TEXT_RE.test(c))) return null;
  return map;
}

function cleanPhone(v: string | undefined): string | null {
  const digits = (v ?? "").replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

function cleanName(v: string | undefined): string | null {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  if (!s || EMAIL_IN_TEXT_RE.test(s)) return null;
  return s.length > 80 ? s.slice(0, 80) : s;
}

export function parseRoster(text: string): RosterParse {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const nonEmpty = lines.map((l, i) => ({ l, i })).filter((x) => x.l.length > 0);
  const rows: RosterRow[] = [];
  const problems: RosterProblem[] = [];
  if (nonEmpty.length === 0) return { rows, problems };

  const delimiter = detectDelimiter(nonEmpty.map((x) => x.l));
  let map: ReturnType<typeof headerMap> = null;
  let start = 0;
  // A header row is a header row even when it is a single "Email" cell.
  map = headerMap(splitLine(nonEmpty[0]!.l, delimiter));
  if (map) start = 1;

  const seen = new Set<string>();
  for (const { l, i } of nonEmpty.slice(start)) {
    if (rows.length >= MAX_ROSTER_ROWS) break;
    const line = i + 1;
    const cells = splitLine(l, delimiter);
    let email: string | null = null;
    let name: string | null = null;
    let phone: string | null = null;

    if (map) {
      email = cells[map.email!] ?? null;
      name = cleanName(map.name != null ? cells[map.name] : [cells[map.first ?? -1], cells[map.last ?? -1]].filter(Boolean).join(" "));
      phone = cleanPhone(map.phone != null ? cells[map.phone] : undefined);
    } else {
      // No header: the email is wherever it is; a name is any other cell
      // that is not a phone; "Jane Doe <jane@x.com>" is honoured too.
      const angle = l.match(/^(.*?)<([^>]+)>\s*$/);
      if (angle) {
        name = cleanName(angle[1]);
        email = angle[2]!.trim();
      } else {
        const idx = cells.findIndex((c) => EMAIL_IN_TEXT_RE.test(c));
        email = idx >= 0 ? (cells[idx]!.match(EMAIL_IN_TEXT_RE)?.[0] ?? null) : null;
        const rest = cells.filter((_, j) => j !== idx);
        phone = cleanPhone(rest.find((c) => cleanPhone(c)));
        name = cleanName(rest.find((c) => c && !cleanPhone(c)));
      }
    }

    email = (email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      problems.push({ line, text: l, reason: "no_email" });
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      problems.push({ line, text: l, reason: "bad_email" });
      continue;
    }
    if (seen.has(email)) {
      problems.push({ line, text: l, reason: "duplicate" });
      continue;
    }
    seen.add(email);
    rows.push({ email, name, phone });
  }
  return { rows, problems };
}
