/**
 * The name, face and role this business gave each AI employee — the same
 * resolution as the Command Center and the AI activity feed: the org's own
 * row, then the roster blueprint, then a seeded avatar. An org that never
 * seeded its workforce still gets the whole team, by their roster defaults.
 */
import { CORE_ROSTER, getBlueprint, type AiEmployee } from "@helm/ai-workforce";
import { defaultAvatarForSeed } from "@helm/ui";
import type { TeamFace } from "./approval-view";

export const TEAM_SLUGS = CORE_ROSTER.map((b) => b.slug);

export function teamFaces(
  employees: ReadonlyArray<Pick<AiEmployee, "slug" | "name" | "role"> & { avatar?: string | null }>,
): Record<string, TeamFace> {
  const out: Record<string, TeamFace> = {};
  for (const slug of TEAM_SLUGS) {
    const e = employees.find((x) => x.slug === slug);
    const bp = getBlueprint(slug);
    out[slug] = {
      slug,
      name: e?.name ?? bp?.name ?? slug,
      role: e?.role ?? bp?.role ?? "",
      avatar: e?.avatar ?? bp?.avatar ?? defaultAvatarForSeed(slug),
    };
  }
  return out;
}
