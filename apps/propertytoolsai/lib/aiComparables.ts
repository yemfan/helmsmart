import "server-only";

import { generateAiCma, isValuationFailure } from "@repo/valuation/server";

import type { PropertyRow, PropertyCompRow } from "./propertyService";

/**
 * AI-comps fallback for `getComparables`. When the warehouse has no priced
 * comps for an address (sparse ZIP, no sold snapshots), we fall back to the
 * shared AI CMA engine (Claude + web search) to source real, cited comparable
 * sales. Each AI comp is mapped into the same PropertyCompRow shape the four
 * comps-rendering routes already consume (they read
 * `comp_property.sqft/beds/baths/address` + `sold_price`), so no consumer
 * changes are needed.
 *
 * The synthetic comp_property/row ids are namespaced "ai-<i>" and these rows
 * are NOT persisted to the warehouse — they're a per-request enrichment only.
 * This adds a ~30-40s generateAiCma call, so callers gate it behind an empty
 * warehouse result (see getComparables).
 */
export async function getAiComparables(
  address: string,
  limit = 10,
): Promise<PropertyCompRow[]> {
  let result;
  try {
    result = await generateAiCma({ address });
  } catch {
    return [];
  }
  if (isValuationFailure(result)) return [];

  const now = new Date().toISOString();
  const comps = result.snapshot.comps.slice(0, limit);

  return comps.map((c, i): PropertyCompRow => {
    const compProperty: PropertyRow = {
      id: `ai-${i}`,
      address: c.address,
      city: null,
      state: null,
      zip_code: null,
      lat: null,
      lng: null,
      property_type: c.propertyType ?? null,
      beds: c.beds ?? null,
      baths: c.baths ?? null,
      sqft: c.sqft ?? null,
      lot_size: c.lotSizeSqft ?? null,
      year_built: c.yearBuilt ?? null,
      created_at: now,
      updated_at: now,
    };
    return {
      id: `ai-${i}`,
      subject_property_id: "",
      comp_property_id: `ai-${i}`,
      distance_miles: c.distanceMiles ?? null,
      sold_price: c.price ?? null,
      sold_date: c.soldDate || null,
      similarity_score: null,
      created_at: now,
      comp_property: compProperty,
    };
  });
}
