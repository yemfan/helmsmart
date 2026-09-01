import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { BRAND_KIT_COLUMNS, brandPromptContext, type BrandKit } from "@/lib/brandKit";
import type { BrandBrief } from "@/lib/research";
import type { ToolOutcome } from "../types";

/**
 * Helpers shared by the tool wrappers. Nothing here holds business logic — it
 * loads the brand context the existing engines already expect, and turns thrown
 * errors into outcomes a person can act on.
 */

/** The user's brand kit, or null. Tolerates a partially-migrated DB. */
export async function loadBrandKit(userId: string): Promise<BrandKit | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("brand_kits").select(BRAND_KIT_COLUMNS).eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return data as BrandKit;
}

/** Brand context string folded into draft prompts. "" when nothing useful is set. */
export async function loadBrandContext(userId: string): Promise<string> {
  return brandPromptContext(await loadBrandKit(userId));
}

/**
 * The researched BrandBrief stored on brand_kits.business (migration 0021).
 * This is what the planner grounds on — without it, plans are generic, which is
 * exactly why intake is a hard gate.
 */
export async function loadBrief(userId: string): Promise<BrandBrief | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("brand_kits").select("business").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  const brief = (data as { business?: unknown }).business;
  return brief && typeof brief === "object" ? (brief as BrandBrief) : null;
}

/** The account's credit balance. */
export async function loadCredits(userId: string): Promise<number> {
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("credits").eq("user_id", userId).maybeSingle();
  return (data as { credits?: number } | null)?.credits ?? 0;
}

/** The CTA destination: the owner-configured company URL, or null. */
export async function loadDestination(userId: string): Promise<string | null> {
  const kit = await loadBrandKit(userId);
  return kit?.company_url?.trim() || null;
}

/**
 * Turn a thrown error into a failed outcome with a message the owner can act
 * on. Raw provider text is never the primary message — §25 and the standing
 * rule that users see friendly, accurate, actionable errors.
 */
export function toFailure(e: unknown, fallback: string): ToolOutcome {
  const raw = e instanceof Error ? e.message : "";
  const lower = raw.toLowerCase();

  if (lower.includes("anthropic_api_key")) {
    return { status: "failed", error: "The AI isn't configured on the server yet, so this step can't run." };
  }
  if (lower.includes("not enough credits") || lower.includes("credit")) {
    return { status: "failed", error: "Not enough credits for this step. Top up in Settings → Billing and I'll pick it back up." };
  }
  if (lower.includes("timeout") || lower.includes("etimedout") || lower.includes("fetch failed")) {
    return { status: "failed", error: `${fallback} It looks like a temporary network problem.`, retryable: true };
  }
  // Keep the underlying reason when it reads like a sentence; drop it when it
  // reads like a stack trace or a provider error code.
  const usable = raw && raw.length < 160 && !raw.includes("\n") && !/^[A-Z_]+$/.test(raw);
  return { status: "failed", error: usable ? `${fallback} (${raw})` : fallback };
}
