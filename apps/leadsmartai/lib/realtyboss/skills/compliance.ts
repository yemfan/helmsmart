/**
 * State-parameterized compliance for the Realtor skills library.
 *
 * Federal Fair Housing classes are universal; license authority, the license
 * label, AVM-disclaimer rules, and state-added protected classes vary. Skill
 * prompts reference the placeholders {{state}}, {{license_authority}},
 * {{license_label}}, {{avm_disclaimer_rule}}, {{protected_classes}} — this
 * module fills them from the agent's chosen state.
 *
 * HONEST SCOPE: we encode the license authority + label accurately, flag the
 * best-known state-added protected classes and AVM rules, and instruct the AI to
 * apply the state's full ruleset and FLAG anything it's unsure of for the agent's
 * broker to confirm. It is a state-aware framework, not a 50-state legal database.
 */

const FEDERAL_PROTECTED =
  "race, color, religion, national origin, sex, disability, familial status";

export type StateCompliance = {
  code: string;
  state: string;
  /** Short authority name for citations, e.g. "DRE", "TREC". */
  licenseAuthority: string;
  /** How the license number is labeled in ads, e.g. "DRE #", "TREC License #". */
  licenseLabel: string;
  /** State AVM/estimate-disclaimer rule, or null if none well-known. */
  avmDisclaimerRule: string | null;
  /** Notable protected classes ADDED beyond the federal set, or null. */
  notableProtectedClasses: string | null;
};

const STATES: Record<string, StateCompliance> = {
  CA: {
    code: "CA",
    state: "California",
    licenseAuthority: "DRE",
    licenseLabel: "DRE #",
    avmDisclaimerRule:
      "California (Bus. & Prof. AB 2863): any automated or estimated value must carry a disclaimer that it is a broker opinion, not an appraisal",
    notableProtectedClasses:
      "source of income, sexual orientation, gender identity/expression, marital status, ancestry, age, genetic information, immigration status, primary language, military/veteran status",
  },
  TX: { code: "TX", state: "Texas", licenseAuthority: "TREC", licenseLabel: "TREC License #", avmDisclaimerRule: null, notableProtectedClasses: null },
  FL: { code: "FL", state: "Florida", licenseAuthority: "Florida DBPR/FREC", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: null },
  NY: {
    code: "NY",
    state: "New York",
    licenseAuthority: "NY DOS",
    licenseLabel: "License #",
    avmDisclaimerRule: null,
    notableProtectedClasses:
      "age, sexual orientation, gender identity/expression, marital status, military status, source of income, lawful occupation",
  },
  WA: {
    code: "WA",
    state: "Washington",
    licenseAuthority: "WA DOL",
    licenseLabel: "License #",
    avmDisclaimerRule: null,
    notableProtectedClasses: "sexual orientation, gender identity, marital status, source of income, honorably discharged veteran/military status",
  },
  AZ: { code: "AZ", state: "Arizona", licenseAuthority: "ADRE", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: null },
  NV: { code: "NV", state: "Nevada", licenseAuthority: "Nevada Real Estate Division", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: "sexual orientation, gender identity/expression" },
  GA: { code: "GA", state: "Georgia", licenseAuthority: "GREC", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: null },
  NC: { code: "NC", state: "North Carolina", licenseAuthority: "NCREC", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: null },
  CO: { code: "CO", state: "Colorado", licenseAuthority: "Colorado DORA/DRE", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: "sexual orientation, gender identity/expression, marital status, source of income" },
  IL: { code: "IL", state: "Illinois", licenseAuthority: "IDFPR", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: "sexual orientation, gender identity, marital status, military status, order of protection status, source of income" },
  NJ: { code: "NJ", state: "New Jersey", licenseAuthority: "NJ REC", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: "sexual orientation, gender identity/expression, marital/civil-union status, source of lawful income, military service" },
  MA: { code: "MA", state: "Massachusetts", licenseAuthority: "MA BORRE", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: "sexual orientation, gender identity, marital status, age, source of income, veteran status" },
  VA: { code: "VA", state: "Virginia", licenseAuthority: "Virginia DPOR/REB", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: "sexual orientation, gender identity, source of funds, military status" },
  OR: { code: "OR", state: "Oregon", licenseAuthority: "Oregon REA", licenseLabel: "License #", avmDisclaimerRule: null, notableProtectedClasses: "sexual orientation, gender identity, marital status, source of income" },
};

/** Resolve a state's compliance profile; unknown/blank → a generic, state-aware fallback. */
export function getStateCompliance(code?: string | null): StateCompliance {
  const c = (code ?? "").toUpperCase().trim();
  if (STATES[c]) return STATES[c];
  return {
    code: c || "US",
    state: c || "your state",
    licenseAuthority: "your state real estate commission",
    licenseLabel: "License #",
    avmDisclaimerRule: null,
    notableProtectedClasses: null,
  };
}

/** Placeholder values injected into skill prompts for the chosen state. */
export function compliancePlaceholders(sc: StateCompliance): Record<string, string> {
  return {
    state: sc.state,
    license_authority: sc.licenseAuthority,
    license_label: sc.licenseLabel,
    avm_disclaimer_rule:
      sc.avmDisclaimerRule ??
      "if your state requires an AVM/estimated-value disclaimer, include one stating this is a broker opinion, not an appraisal",
    protected_classes: sc.notableProtectedClasses
      ? `${FEDERAL_PROTECTED}, and in ${sc.state}: ${sc.notableProtectedClasses} (apply ${sc.state}'s full protected-class list; flag anything uncertain)`
      : `${FEDERAL_PROTECTED} (plus any additional classes protected in ${sc.state} — apply them and flag uncertainty for broker review)`,
  };
}

/** States we have an explicit profile for (the rest use the generic fallback). */
export const SUPPORTED_STATES: Array<{ code: string; state: string }> = Object.values(STATES).map((s) => ({
  code: s.code,
  state: s.state,
}));
