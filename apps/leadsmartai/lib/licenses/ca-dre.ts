/**
 * The California DRE public license record — the pure parser.
 *
 * DRE publishes every licensee at
 *   https://www2.dre.ca.gov/PublicASP/pplinfo.asp?License_id=<8 digits>
 * as a plain HTML table: License Type, Name, Mailing Address, License ID,
 * Expiration Date, License Status, the issue date, Former Name(s),
 * Responsible Broker (salespersons) or Main Office / officers / DBAs
 * (corporations), and a Comment line that reads "NO DISCIPLINARY ACTION"
 * when there is none. An unknown ID returns the generic lookup page with
 * no table at all.
 *
 * This reads that table into a record. It is the free way to fill in an
 * agent's details from the number they typed, and to tell whether the
 * license is current. No I/O here; lookup.server.ts fetches the page.
 */

export type DreBroker = { licenseId: string; name: string; address: string | null };

export type DreRecord = {
  source: "ca_dre";
  licenseId: string;
  /** SALESPERSON, BROKER, CORPORATION, … as DRE prints it. */
  licenseType: string;
  /** As DRE prints it: "Last, First Middle" for a person, the entity name otherwise. */
  nameRaw: string;
  /** "First Middle Last" for a person; the entity name otherwise. */
  displayName: string;
  mailingAddress: string | null;
  /** ISO date, or null when DRE printed nothing usable. */
  expiresOn: string | null;
  issuedOn: string | null;
  /** LICENSED, LICENSED NBA, EXPIRED, SUSPENDED, REVOKED, … */
  statusRaw: string;
  /** True for any status DRE prefixes with LICENSED (incl. "LICENSED NBA": licensed, no broker association). */
  active: boolean;
  /** Salespersons: the broker they hang their license with; null when none. */
  responsibleBroker: DreBroker | null;
  /** Corporations and brokers: the main office address. */
  mainOffice: string | null;
  /** The Comment line when it is anything but "NO DISCIPLINARY ACTION". */
  discipline: string | null;
  /** When the page says its data was taken from DRE records, if shown. */
  asOf: string | null;
};

function decode(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function cellLines(html: string): string[] {
  const text = decode(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""));
  return text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Every row as [label, value lines]. Rows without a label continue the previous one. */
function rows(html: string): [string, string[]][] {
  const out: [string, string[]][] = [];
  const re = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const cells = [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((c) => c[1]);
    if (cells.length < 2) continue;
    const label = cellLines(cells[0]).join(" ").replace(/\s*:\s*$/, "").trim();
    const value = cellLines(cells[1]);
    if (label) out.push([label, value]);
    else if (out.length) out[out.length - 1][1].push(...value);
  }
  return out;
}

/** "02/18/14" → "2014-02-18"; "10/07/27" → "2027-10-07". Two-digit years below 70 are this century. */
export function dreDate(raw: string | null | undefined): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(raw ?? "");
  if (!m) return null;
  const y = m[3].length === 4 ? Number(m[3]) : Number(m[3]) < 70 ? 2000 + Number(m[3]) : 1900 + Number(m[3]);
  const d = new Date(Date.UTC(y, Number(m[1]) - 1, Number(m[2])));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** "Sample, Alex Jordan" → "Alex Jordan Sample"; an entity name passes through. */
export function dreDisplayName(raw: string): string {
  const s = raw.replace(/\s+/g, " ").trim();
  const i = s.indexOf(",");
  if (i < 0 || /\b(inc|llc|corp|company|co|ltd|group|realty|properties|associates|partners)\b\.?/i.test(s)) return s;
  const last = s.slice(0, i).trim();
  const first = s.slice(i + 1).trim();
  return first ? `${first} ${last}` : last;
}

export function parseDrePage(html: string): DreRecord | null {
  const table = rows(html);
  const get = (label: string) => table.find(([l]) => l.toLowerCase() === label.toLowerCase())?.[1] ?? null;
  const licenseId = get("License ID")?.[0]?.replace(/\D/g, "") ?? "";
  if (!licenseId) return null;

  const nameRaw = get("Name")?.join(" ") ?? "";
  const statusRaw = (get("License Status")?.join(" ") ?? "").toUpperCase().trim();
  const issuedRow = table.find(([l]) => /license issued/i.test(l))?.[1] ?? null;
  const brokerRows = get("Responsible Broker");
  let responsibleBroker: DreBroker | null = null;
  if (brokerRows && !/NO CURRENT RESPONSIBLE BROKER/i.test(brokerRows.join(" "))) {
    const idLine = brokerRows.find((l) => /License ID/i.test(l)) ?? "";
    const id = idLine.replace(/\D/g, "");
    const rest = brokerRows.filter((l) => !/License ID/i.test(l));
    responsibleBroker = { licenseId: id, name: rest[0] ?? "", address: rest.length > 1 ? rest.slice(1).join(", ") : null };
  }
  const comment = get("Comment")?.join(" ") ?? "";
  const asOf = /records of the Department of Real Estate on\s*([\d/]+ [\d:]+ [AP]M)/i.exec(html)?.[1] ?? null;

  return {
    source: "ca_dre",
    licenseId,
    licenseType: (get("License Type")?.[0] ?? "").toUpperCase(),
    nameRaw,
    displayName: dreDisplayName(nameRaw),
    mailingAddress: get("Mailing Address")?.join(", ") ?? null,
    expiresOn: dreDate(get("Expiration Date")?.[0]),
    issuedOn: dreDate(issuedRow?.[0]),
    statusRaw,
    active: /^LICENSED\b/.test(statusRaw),
    responsibleBroker,
    mainOffice: get("Main Office")?.slice(0, 2).join(", ") ?? null,
    discipline: comment && !/^NO DISCIPLINARY ACTION/i.test(comment) ? comment : null,
    asOf,
  };
}

export const DRE_LOOKUP = "https://www2.dre.ca.gov/PublicASP/pplinfo.asp";

export function dreUrl(licenseId: string): string {
  return `${DRE_LOOKUP}?License_id=${encodeURIComponent(licenseId)}`;
}
