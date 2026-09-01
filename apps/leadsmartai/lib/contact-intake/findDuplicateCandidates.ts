import { getDuplicateReasons, incomingDuplicateScore } from "@/lib/contact-enrichment/dedupe";
import type { DuplicateMatchReason } from "@/lib/contact-enrichment/types";
import { normalizeAddress, normalizeEmail, normalizePhone, displayAddress, displayPhone } from "@/lib/contact-enrichment/normalize";
import type { LeadLike } from "@/lib/contact-enrichment/types";
import { supabaseAdmin } from "@/lib/supabase/admin";

const SELECT_LEADS =
  "id, agent_id, created_at, name, email, phone, property_address, merged_into_lead_id, notes";

/**
 * Best-effort duplicate lookup for a not-yet-persisted contact (same rules as admin duplicate scan).
 */
export async function findBestDuplicateMatchForAgent(
  agentId: string,
  incoming: LeadLike
): Promise<{ leadId: string; score: number; reasons: DuplicateMatchReason[] } | null> {
  const ne = normalizeEmail(typeof incoming.email === "string" ? incoming.email : null);
  const np = normalizePhone(displayPhone(incoming));
  const na = normalizeAddress(displayAddress(incoming));

  const byId = new Map<string, LeadLike>();

  async function collectRows(field: "normalized_email" | "normalized_phone" | "normalized_address", val: string) {
    const { data, error } = await supabaseAdmin
      .from("contacts")
      .select(SELECT_LEADS)
      .eq("agent_id", agentId)
      .eq(field, val)
      .is("merged_into_lead_id", null)
      .limit(40);

    if (error) throw error;
    for (const row of data ?? []) {
      const id = String((row as { id?: unknown }).id ?? "");
      if (id) byId.set(id, row as LeadLike);
    }
  }

  if (ne) await collectRows("normalized_email", ne);
  if (np) await collectRows("normalized_phone", np);
  if (na) await collectRows("normalized_address", na);

  let best: { leadId: string; score: number; reasons: DuplicateMatchReason[] } | null = null;

  for (const row of byId.values()) {
    const score = incomingDuplicateScore(incoming, row);
    if (score < 50) continue;
    const reasons = getDuplicateReasons(incoming, row);
    if (!best || score > best.score) {
      best = { leadId: String(row.id), score: Math.min(score, 100), reasons };
    }
  }

  return best;
}
