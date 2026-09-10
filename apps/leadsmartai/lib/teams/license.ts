/**
 * Agent licenses — the pure half.
 *
 * What a license number looks like in each state, where a person checks
 * it, what the ARELLO licensee service can and cannot confirm, how a
 * verification answer turns into a status, and the brokerage line that
 * goes on every published post. No I/O; license.server.ts does the rest.
 */

export type LicenseStatus = "format_ok" | "verified" | "not_found" | "inactive" | "mismatch" | "unavailable";

export type AgentLicense = {
  agentId: string;
  number: string;
  state: string;
  status: LicenseStatus;
  verifiedAt: string | null;
  verifiedBy: "arello" | "manager" | null;
};

type StateRule = {
  /** The regulator's name, for the label and the lookup link. */
  regulator: string;
  /** What precedes the number in an ad in that state. */
  label: string;
  pattern: RegExp;
  example: string;
  /** The regulator's public lookup, for a person to check by hand. */
  lookup: string;
};

/**
 * Shapes as the regulators issue them. A rule is a sanity check on typing,
 * not proof of anything: "8 digits" catches a phone number pasted in the
 * wrong box, and nothing more.
 */
export const LICENSE_STATES: Record<string, StateRule> = {
  CA: { regulator: "California DRE", label: "DRE #", pattern: /^\d{8}$/, example: "01234567", lookup: "https://www2.dre.ca.gov/publicasp/pplinfo.asp" },
  TX: { regulator: "Texas TREC", label: "TREC #", pattern: /^\d{6,7}$/, example: "0612345", lookup: "https://www.trec.texas.gov/apps/license-holder-search/" },
  FL: { regulator: "Florida DBPR", label: "Lic. #", pattern: /^(SL|BK|BO|CQ)?\d{6,7}$/i, example: "SL3123456", lookup: "https://www.myfloridalicense.com/wl11.asp" },
  NY: { regulator: "New York DOS", label: "Lic. #", pattern: /^\d{8,10}$/, example: "10401234567", lookup: "https://appext20.dos.ny.gov/nydos/selSearchType.do" },
  WA: { regulator: "Washington DOL", label: "Lic. #", pattern: /^\d{5,8}$/, example: "12345678", lookup: "https://professions.dol.wa.gov/s/license-lookup" },
  AZ: { regulator: "Arizona ADRE", label: "Lic. #", pattern: /^(SA|BR)\d{6}$/i, example: "SA123456", lookup: "https://services.azre.gov/publicdatabase/SearchIndividuals.aspx" },
  NV: { regulator: "Nevada NRED", label: "Lic. #", pattern: /^[SB]\.?\d{7}$/i, example: "S.0123456", lookup: "https://www.red.nv.gov/Content/Licensing/Verification/" },
  CO: { regulator: "Colorado DORA", label: "Lic. #", pattern: /^(FA|ER|EA)\.?\d{9}$/i, example: "FA100012345", lookup: "https://apps2.colorado.gov/dora/licensing/lookup/licenselookup.aspx" },
  GA: { regulator: "Georgia GREC", label: "Lic. #", pattern: /^\d{6}$/, example: "312345", lookup: "https://ata.grec.state.ga.us/" },
  NJ: { regulator: "New Jersey REC", label: "Lic. #", pattern: /^\d{7,8}$/, example: "1234567", lookup: "https://newjersey.mylicense.com/verification/" },
  IL: { regulator: "Illinois IDFPR", label: "Lic. #", pattern: /^475\.?\d{6}$/, example: "475.123456", lookup: "https://online-dfpr.micropact.com/lookup/licenselookup.aspx" },
  OR: { regulator: "Oregon REA", label: "Lic. #", pattern: /^\d{9}$/, example: "201234567", lookup: "https://orea.elicense.irondata.com/Lookup/LicenseLookup.aspx" },
  MA: { regulator: "Massachusetts Board", label: "Lic. #", pattern: /^\d{7,9}$/, example: "9512345", lookup: "https://www.mass.gov/how-to/check-a-professional-license" },
  PA: { regulator: "Pennsylvania REC", label: "Lic. #", pattern: /^(RS|RB|RM|AB)\d{6}[A-Z]?$/i, example: "RS312345", lookup: "https://www.pals.pa.gov/#/page/search" },
  VA: { regulator: "Virginia DPOR", label: "Lic. #", pattern: /^0225\d{6}$/, example: "0225123456", lookup: "https://www.dpor.virginia.gov/LicenseLookup/" },
  NC: { regulator: "North Carolina REC", label: "Lic. #", pattern: /^\d{6}$/, example: "312345", lookup: "https://www.ncrec.gov/Licensees/LicenseeSearch" },
  OH: { regulator: "Ohio DRE", label: "Lic. #", pattern: /^\d{9,10}$/, example: "2020012345", lookup: "https://elicense3.com.ohio.gov/" },
  MI: { regulator: "Michigan LARA", label: "Lic. #", pattern: /^\d{10}$/, example: "6501123456", lookup: "https://aca-prod.accela.com/MILARA/" },
  MN: { regulator: "Minnesota Commerce", label: "Lic. #", pattern: /^\d{6,8}$/, example: "40312345", lookup: "https://www.commerce.mn.gov/license-lookup" },
  UT: { regulator: "Utah DRE", label: "Lic. #", pattern: /^\d{6,8}-[A-Z0-9]{4}$/i, example: "1234567-SA00", lookup: "https://secure.utah.gov/llv/search/" },
};

export const US_STATES: readonly string[] = ["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"];

/** Jurisdictions the ARELLO licensee web service carries (arello.com, September 2026). */
export const ARELLO_JURISDICTIONS: ReadonlySet<string> = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NC", "OK", "OR", "SC", "SD", "TN", "TX", "UT", "VT", "WV", "WY",
]);

const GENERIC = /^[A-Z0-9][A-Z0-9.\-]{2,14}$/i;

/** "DRE # 0123 4567" → "01234567"; "lic. rs312345" → "RS312345". */
export function normalizeLicenseNumber(raw: string): string {
  return raw
    .trim()
    .replace(/^(dre|trec|lic\.?|license|licence|no\.?|number)\s*/i, "")
    .replace(/^#\s*/, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function normalizeState(raw: string): string {
  const s = raw.trim().toUpperCase();
  return US_STATES.includes(s) ? s : "";
}

export type FormatCheck = { ok: true; number: string; state: string } | { ok: false; reason: "state" | "empty" | "format" };

export function checkLicenseFormat(stateRaw: string, numberRaw: string): FormatCheck {
  const state = normalizeState(stateRaw);
  if (!state) return { ok: false, reason: "state" };
  const number = normalizeLicenseNumber(numberRaw);
  if (!number) return { ok: false, reason: "empty" };
  const rule = LICENSE_STATES[state];
  if (!(rule ? rule.pattern : GENERIC).test(number)) return { ok: false, reason: "format" };
  return { ok: true, number, state };
}

export function licenseLabel(state: string): string {
  return LICENSE_STATES[state]?.label ?? "Lic. #";
}

export function licenseExample(state: string): string | null {
  return LICENSE_STATES[state]?.example ?? null;
}

export function licenseLookupUrl(state: string): string | null {
  return LICENSE_STATES[state]?.lookup ?? null;
}

export function canVerifyViaArello(state: string): boolean {
  return ARELLO_JURISDICTIONS.has(state);
}

/** One record as the ARELLO / SourceRE search returns it (the fields we read). */
export type ArelloHit = {
  licenseNumber?: string | null;
  licenseStatus?: string | null;
  licenseType?: string | null;
  licenseExpirationDate?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  officeName?: string | null;
  score?: number | null;
};

const ACTIVE = /\b(active|current|valid|licensed|in good standing)\b/i;

/**
 * What the answer means. The number must match exactly (a fuzzy name hit
 * is not proof); an expired or suspended license is "inactive"; a matching
 * number under a different surname is a mismatch worth a person's look.
 */
export function verificationOutcome(hits: readonly ArelloHit[], want: { number: string; lastName?: string | null }): { status: LicenseStatus; hit: ArelloHit | null } {
  const number = normalizeLicenseNumber(want.number);
  const hit = hits.find((h) => normalizeLicenseNumber(String(h.licenseNumber ?? "")) === number) ?? null;
  if (!hit) return { status: "not_found", hit: null };
  const last = want.lastName?.trim().toLowerCase();
  if (last && hit.lastName && hit.lastName.trim().toLowerCase() !== last) return { status: "mismatch", hit };
  if (hit.licenseStatus && !ACTIVE.test(hit.licenseStatus)) return { status: "inactive", hit };
  if (hit.licenseExpirationDate && Date.parse(hit.licenseExpirationDate) < Date.now()) return { status: "inactive", hit };
  return { status: "verified", hit };
}

export type BrokerageLineInput = {
  brandName: string | null;
  brandLicense: string | null;
  agentName: string | null;
  agentLicense: { number: string; state: string } | null;
};

/** "MAXY Realty Group · DRE #02123456 · Michael Ye, DRE #01234567" — or null when there is nothing required to say. */
export function brokerageLine(input: BrokerageLineInput): string | null {
  const parts: string[] = [];
  if (input.brandName) parts.push(input.brandName);
  if (input.brandLicense) parts.push(input.brandLicense);
  if (input.agentLicense) {
    const lic = `${licenseLabel(input.agentLicense.state)}${input.agentLicense.number}`;
    parts.push(input.agentName ? `${input.agentName}, ${lic}` : lic);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Append the line unless the caption already identifies the brokerage. */
export function ensureBrokerageLine(caption: string, line: string | null, brandName: string | null): string {
  if (!line) return caption;
  const text = caption.trim();
  if (brandName && text.toLowerCase().includes(brandName.toLowerCase())) return text;
  if (text.includes(line)) return text;
  return `${text}\n\n${line}`;
}
