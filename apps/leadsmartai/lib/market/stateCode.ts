/**
 * The two-letter code for a US state, however it was typed.
 *
 * `normalizeCityState` only uppercased the state, so "California" became
 * "CALIFORNIA" and the (city, state) unique constraint accepted it as a
 * different market from "CA". 21 cities ended up with two rows each — one of
 * them, Alhambra, holding two DIFFERENT invented medians, because
 * `buildFallbackCityData` hashes "city|state" and the two spellings hash
 * apart. The refresh then paid an AI call for each half of every pair.
 *
 * The state arrives from an agent typing into `get_market_snapshot`, from a
 * URL segment, and from the model's own answer, so "California", "california"
 * and "CA" all reach this. Anything already two letters is passed through
 * uppercased; anything unrecognised is left alone rather than guessed, because
 * a wrong code is a lookup against the wrong market, while an odd string is
 * merely a miss.
 */

const STATE_CODES: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR",
  CALIFORNIA: "CA", COLORADO: "CO", CONNECTICUT: "CT", DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC", FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI",
  IDAHO: "ID", ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA",
  KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA", MAINE: "ME",
  MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN",
  MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE",
  NEVADA: "NV", "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM",
  "NEW YORK": "NY", "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH",
  OKLAHOMA: "OK", OREGON: "OR", PENNSYLVANIA: "PA", "PUERTO RICO": "PR",
  "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT",
  VIRGINIA: "VA", WASHINGTON: "WA", "WEST VIRGINIA": "WV",
  WISCONSIN: "WI", WYOMING: "WY",
};

export function stateCode(input: string | null | undefined): string {
  // Collapse inner runs of whitespace too: "New  York" is New York.
  const key = String(input ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!key) return "";
  return STATE_CODES[key] ?? key;
}
