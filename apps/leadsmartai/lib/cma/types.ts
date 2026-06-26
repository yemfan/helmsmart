/**
 * CMA (Comparative Market Analysis) types — re-exported from the shared
 * `@repo/valuation` package so leadsmartai (RealtyBoss) and propertytoolsai
 * share ONE source of truth. Kept at `@/lib/cma/types` so existing imports
 * (CmaSnapshot, CmaCompRow, CmaSubject, CmaStrategy, CmaValuation, CmaSource)
 * stay stable.
 *
 * Versioning: change the shape in the package (add CmaSnapshotV2), never mutate
 * in place — stored cma_reports.snapshot_json must stay readable as written.
 */
export * from "@repo/valuation";
