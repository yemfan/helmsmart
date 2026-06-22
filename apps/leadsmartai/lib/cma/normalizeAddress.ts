/**
 * Canonicalize a free-text US street address for storage + display.
 *
 * Title-cases words, collapses whitespace, normalizes comma spacing, and
 * uppercases street directionals (N/S/E/W/NE…) and the trailing state code,
 * while leaving house numbers, ZIPs, and ordinals (1st, 22nd) intact.
 *
 *   "220 e hellman ave, monterey park, ca 91755"
 *     → "220 E Hellman Ave, Monterey Park, CA 91755"
 *
 * Pure (no server-only import) so vitest can exercise it directly. Not a USPS
 * standardizer — just a clean, predictable presentation of what the agent typed.
 */

const DIRECTIONALS = new Set([
  "n", "s", "e", "w", "ne", "nw", "se", "sw",
  "north", "south", "east", "west",
]);

const STATES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id",
  "il", "in", "ia", "ks", "ky", "la", "me", "md", "ma", "mi", "mn", "ms",
  "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny", "nc", "nd", "oh", "ok",
  "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy", "dc",
]);

function isZip(token: string): boolean {
  return /^\d{5}(-\d{4})?$/.test(token);
}

/** "1st", "22nd", "3rd", "4th" — keep the ordinal suffix lowercase. */
function isOrdinal(token: string): boolean {
  return /^\d+(st|nd|rd|th)$/i.test(token);
}

function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

export function normalizeAddress(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";

  const parts = cleaned.split(",").map((p) => p.trim()).filter(Boolean);

  const normalizedParts = parts.map((part, partIndex) => {
    const words = part.split(" ").filter(Boolean);
    const lastPart = partIndex === parts.length - 1;

    return words
      .map((word, wordIndex) => {
        const core = word.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (isZip(word)) return word;
        if (/^\d+$/.test(word)) return word; // house number
        if (isOrdinal(word)) return word.toLowerCase();
        if (DIRECTIONALS.has(core)) return word.toUpperCase();

        // State code: only in the trailing segment, and only when it's the
        // final token or immediately precedes a ZIP — avoids uppercasing
        // street-name words that happen to match a state code ("In", "Or").
        if (lastPart && STATES.has(core)) {
          const next = words[wordIndex + 1];
          if (!next || isZip(next)) return word.toUpperCase();
        }
        return titleCase(word);
      })
      .join(" ");
  });

  return normalizedParts.join(", ");
}
