import "server-only";

import { listActiveGeographies } from "@/lib/research/warehouse/read";
import { geoSlug } from "@/lib/research/warehouse/slug";
import type { GeoLevel } from "@/lib/research/warehouse/types";

/**
 * Region option list for the newsletter subscribe form + hub picker. Always
 * leads with "National (U.S.)", then all active states, then the top metros —
 * sourced from the Data Center warehouse via listActiveGeographies so coverage
 * stays in lockstep with the /data/markets pages.
 */

export type RegionOption = {
  level: GeoLevel;
  /** 'US' | 2-letter state | Zillow metro RegionID */
  code: string;
  /** display label */
  name: string;
  /** URL slug for /newsletter/[region]/[week] */
  slug: string;
};

const TOP_METROS = 40;

export async function listRegionOptions(): Promise<RegionOption[]> {
  const options: RegionOption[] = [
    { level: "national", code: "US", name: "National (U.S.)", slug: "national" },
  ];

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return options;

  try {
    const [states, metros] = await Promise.all([
      listActiveGeographies("state"),
      listActiveGeographies("metro"),
    ]);

    for (const s of states) {
      const slug = geoSlug(s);
      if (!slug) continue;
      options.push({ level: "state", code: s.geo_code, name: s.geo_name, slug });
    }

    for (const m of metros.slice(0, TOP_METROS)) {
      const slug = geoSlug(m);
      if (!slug) continue;
      const label = m.state ? `${m.geo_name}` : m.geo_name;
      options.push({ level: "metro", code: m.geo_code, name: label, slug });
    }
  } catch {
    // Warehouse unreachable — the National option alone is still usable.
  }

  return options;
}
