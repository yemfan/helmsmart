// Employee registry: read the definitions an org has, and seed the Core roster into
// a new org. Seeding is idempotent — re-running never clobbers an org's customizations.

import type { Json } from "@helm/data/types";
import type { AiEmployee, AiEmployeeTool } from "./types";
import { CORE_ROSTER } from "./roster";
import { type Db, rowToEmployee, rowToTool } from "./db";

/** All AI employees defined for an org, ordered by department. */
export async function listEmployees(db: Db, orgId: string): Promise<AiEmployee[]> {
  const { data, error } = await db
    .from("ai_employees")
    .select("*")
    .eq("organization_id", orgId)
    .order("department")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToEmployee);
}

/** One employee by slug (e.g. "emma"), or null. */
export async function getEmployee(db: Db, orgId: string, slug: string): Promise<AiEmployee | null> {
  const { data, error } = await db
    .from("ai_employees")
    .select("*")
    .eq("organization_id", orgId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToEmployee(data) : null;
}

/** One employee by id, or null. */
export async function getEmployeeById(db: Db, orgId: string, employeeId: string): Promise<AiEmployee | null> {
  const { data, error } = await db
    .from("ai_employees")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", employeeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToEmployee(data) : null;
}

/** The DNA-service capabilities an employee is enabled to call. */
export async function listEmployeeTools(db: Db, orgId: string, employeeId: string): Promise<AiEmployeeTool[]> {
  const { data, error } = await db
    .from("ai_employee_tools")
    .select("*")
    .eq("organization_id", orgId)
    .eq("employee_id", employeeId)
    .eq("enabled", true);
  if (error) throw new Error(error.message);
  return (data ?? []).map(rowToTool);
}

/**
 * Set an employee's persona avatar. Merges into the config jsonb (preserving other
 * keys), so no schema change is needed. RLS scopes the write to the caller's org.
 *
 * Returns whether a row actually changed. Through the RLS client an update a
 * policy forbids matches zero rows and comes back with no error at all, so the
 * rows are asked for back — otherwise "saved nothing" and "saved" are the same
 * value, and the picker goes on showing a face the database never took.
 */
export async function setEmployeeAvatar(
  db: Db,
  orgId: string,
  employeeId: string,
  avatar: string,
): Promise<boolean> {
  const { data: existing, error: readErr } = await db
    .from("ai_employees")
    .select("config")
    .eq("organization_id", orgId)
    .eq("id", employeeId)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) return false;

  const config = { ...((existing.config as Record<string, unknown>) ?? {}), avatar };
  const { data, error } = await db
    .from("ai_employees")
    .update({ config: config as unknown as Json })
    .eq("organization_id", orgId)
    .eq("id", employeeId)
    .select("id"); // ← load-bearing
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}

export interface SeedResult {
  /** Number of employees newly created (existing slugs are left untouched). */
  seeded: number;
}

/**
 * Seed the Core roster into an org. Idempotent: upserts on (organization_id, slug)
 * with ignoreDuplicates, so existing employees keep their customizations and only
 * missing ones are created. New employees land in "draft" until the org activates them.
 */
export async function seedCoreRoster(db: Db, orgId: string): Promise<SeedResult> {
  const rows = CORE_ROSTER.map((b) => ({
    organization_id: orgId,
    slug: b.slug,
    name: b.name,
    role: b.role,
    department: b.department,
    dna_module: b.dnaModule,
    industry_pack: b.industryPack,
    goals: b.goals as unknown as Json,
    knowledge_sources: b.knowledgeSources as unknown as Json,
    permissions: b.permissions as unknown as Json,
    model: b.model,
    personality: b.personality,
    status: "draft",
  }));

  const { data, error } = await db
    .from("ai_employees")
    .upsert(rows, { onConflict: "organization_id,slug", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  return { seeded: data?.length ?? 0 };
}
