/**
 * The business profile, and where it lives when its columns do not exist.
 *
 * `organizations.website`, `business_category`, `business_location` and
 * `business_description` are added by migrations 00085 and 00086. **Neither has
 * been applied to the Core project**: measured 2026-09-12 against production,
 * all four columns answer `42703 column does not exist`. The onboarding form
 * has been collecting them and `createOrg` has been writing them best-effort
 * and discarding the result, so for every account created so far the answer to
 * "what happened to the website I typed?" is: nothing, and nobody was told.
 *
 * That is a migration to apply, not a thing to code around for ever — the SQL
 * is in `supabase/migrations/00085…` and `00086…` and neither changes an
 * existing row. But the guided setup cannot wait for it and must not blank
 * itself over it, so the profile has a second home that DOES exist everywhere:
 * the `knowledge_base` entry titled "Business profile" that `createOrg`
 * already mirrors it into, and that the content generator and the receptionist
 * already read.
 *
 * These two functions are that mirror's format. `render` writes the lines —
 * compatible with the ones `createOrg` has always written — and `parse` reads
 * them back, so the setup wizard and the draft can recover the profile whether
 * it is in columns, in the mirror, or in both. Pure and tested; the fallback
 * only helps if it round-trips.
 */

export type BusinessProfile = {
  website: string;
  category: string;
  location: string;
  description: string;
};

/** The knowledge_base title `createOrg` uses. Changing it orphans the mirror. */
export const PROFILE_TITLE = "Business profile";

export const EMPTY_PROFILE: BusinessProfile = { website: "", category: "", location: "", description: "" };

/** Everything blank? Then there is nothing to mirror and nothing to draft from. */
export function isEmptyProfile(p: BusinessProfile): boolean {
  return !p.website.trim() && !p.category.trim() && !p.location.trim() && !p.description.trim();
}

/**
 * The mirrored entry's content. The first three lines are labelled so they can
 * be read back; anything after them is the owner's own words, kept verbatim
 * because that is what the receptionist repeats.
 */
export function renderProfile(p: BusinessProfile): string {
  const lines: string[] = [];
  if (p.website.trim()) lines.push(`Website: ${p.website.trim()}`);
  if (p.category.trim()) lines.push(`Category: ${p.category.trim()}.`);
  if (p.location.trim()) lines.push(`Based in ${p.location.trim()}.`);
  if (p.description.trim()) lines.push(p.description.trim());
  return lines.join("\n");
}

/**
 * Read a mirrored entry back into fields. Best-effort by design: the content is
 * editable in Settings → Voice AI like any other knowledge entry, so an owner
 * may well have rewritten it into prose. Whatever cannot be recognised becomes
 * part of the description, which is exactly where prose belongs.
 */
export function parseProfile(content: string | null | undefined): BusinessProfile {
  const out: BusinessProfile = { ...EMPTY_PROFILE };
  const rest: string[] = [];
  for (const line of (content ?? "").split("\n")) {
    const l = line.trim();
    if (!l) continue;
    const website = l.match(/^Website:\s*(.+)$/i);
    if (website && !out.website) {
      out.website = website[1].trim().replace(/[.\s]+$/, "");
      continue;
    }
    const category = l.match(/^Category:\s*(.+)$/i);
    if (category && !out.category) {
      out.category = category[1].trim().replace(/\.\s*$/, "");
      continue;
    }
    const location = l.match(/^Based in\s+(.+)$/i);
    if (location && !out.location) {
      out.location = location[1].trim().replace(/\.\s*$/, "");
      continue;
    }
    rest.push(l);
  }
  out.description = rest.join("\n").trim();
  return out;
}

/**
 * The columns where they exist, filled in from the mirror where they do not.
 * A value present in both wins from the column — that is the real record; the
 * mirror is a copy that an owner may have edited for the receptionist's ears.
 */
export function mergeProfile(columns: Partial<BusinessProfile> | null, mirror: BusinessProfile): BusinessProfile {
  const pick = (a: string | null | undefined, b: string) => (a && a.trim() ? a.trim() : b);
  return {
    website: pick(columns?.website, mirror.website),
    category: pick(columns?.category, mirror.category),
    location: pick(columns?.location, mirror.location),
    description: pick(columns?.description, mirror.description),
  };
}
