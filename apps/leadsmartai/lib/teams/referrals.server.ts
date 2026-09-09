import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import { upsertContact } from "@/lib/contacts/service";
import { getAgentDisplayName } from "@/lib/ai-call/lead-resolution";
import { getRole } from "./service";
import { movesFor, statusAfter, type Referral, type ReferralInput, type ReferralMove } from "./referrals";

/**
 * Referrals: the reading and the writes. The service-role client bypasses
 * RLS, so every write here checks the caller's part in the referral first
 * and the contact's owner before copying it.
 */

type Row = {
  id: string;
  from_agent_id: unknown;
  to_agent_id: unknown;
  contact_id: string;
  copied_contact_id: string | null;
  contact_name: string;
  fee_pct: number | string;
  note: string | null;
  status: Referral["status"];
  closed_amount: number | string | null;
  created_at: string;
  responded_at: string | null;
  closed_at: string | null;
};

const COLS = "id, from_agent_id, to_agent_id, contact_id, copied_contact_id, contact_name, fee_pct, note, status, closed_amount, created_at, responded_at, closed_at";

function toReferral(r: Row): Referral {
  return {
    id: r.id,
    fromAgentId: String(r.from_agent_id),
    toAgentId: String(r.to_agent_id),
    contactId: r.contact_id,
    copiedContactId: r.copied_contact_id,
    contactName: r.contact_name,
    feePct: Number(r.fee_pct),
    note: r.note,
    status: r.status,
    closedAmount: r.closed_amount == null ? null : Number(r.closed_amount),
    createdAt: r.created_at,
    respondedAt: r.responded_at,
    closedAt: r.closed_at,
  };
}

/** Every referral a manager may see, or just the ones this agent is part of. */
export async function listReferrals(teamId: string, agentId: string, all: boolean): Promise<Referral[]> {
  try {
    let q = supabaseAdmin.from("team_referrals").select(COLS).eq("team_id", teamId).order("created_at", { ascending: false }).limit(2000);
    if (!all) q = q.or(`from_agent_id.eq.${agentId},to_agent_id.eq.${agentId}`);
    const { data } = await q;
    return ((data as Row[] | null) ?? []).map(toReferral);
  } catch (e) {
    console.warn("[teams.referrals] list failed:", e instanceof Error ? e.message : e);
    return [];
  }
}

export type ContactHit = { id: string; name: string; email: string | null; phone: string | null };

/** The sender's own contacts, by name, email or phone. */
export async function searchContacts(agentId: string, q: string): Promise<ContactHit[]> {
  const s = q.trim().replace(/[%,()]/g, "");
  if (s.length < 2) return [];
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, name, email, phone")
    .eq("agent_id", agentId as never)
    .or(`name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`)
    .order("last_activity_at", { ascending: false, nullsFirst: false })
    .limit(8);
  return ((data as { id: string; name: string | null; email: string | null; phone: string | null }[] | null) ?? []).map((c) => ({ id: c.id, name: c.name?.trim() || c.email || c.phone || "—", email: c.email, phone: c.phone }));
}

export async function createReferral(args: { teamId: string; fromAgentId: string; input: ReferralInput }): Promise<Referral> {
  const { teamId, fromAgentId, input } = args;
  if (!(await getRole({ teamId, agentId: input.toAgentId }))) throw new Error("not_a_member");
  const { data: contact } = await supabaseAdmin
    .from("contacts")
    .select("id, name, email, phone, address, property_address, notes")
    .eq("agent_id", fromAgentId as never)
    .eq("id", input.contactId)
    .maybeSingle();
  if (!contact) throw new Error("not_your_contact");
  const c = contact as { id: string; name: string | null; email: string | null; phone: string | null; address: string | null; property_address: string | null; notes: string | null };
  const contactName = c.name?.trim() || c.email || c.phone || "Contact";

  const senderName = (await getAgentDisplayName(fromAgentId).catch(() => null)) ?? "a colleague";
  const noteLine = `Referred by ${senderName} (${input.feePct}% referral fee)${input.note ? `: ${input.note}` : ""}`;
  let copiedId: string | null = null;
  try {
    const copied = await upsertContact(input.toAgentId, {
      name: c.name,
      email: c.email,
      phone: c.phone,
      address: c.address,
      propertyAddress: c.property_address,
      source: "referral",
      notes: [noteLine, c.notes].filter(Boolean).join("\n\n"),
    });
    copiedId = copied.id;
  } catch (e) {
    console.warn("[teams.referrals] contact copy failed:", e instanceof Error ? e.message : e);
  }

  const { data, error } = await supabaseAdmin
    .from("team_referrals")
    .insert({ team_id: teamId, from_agent_id: fromAgentId, to_agent_id: input.toAgentId, contact_id: c.id, copied_contact_id: copiedId, contact_name: contactName, fee_pct: input.feePct, note: input.note } as never)
    .select(COLS)
    .single();
  if (error) throw new Error(error.message);
  return toReferral(data as Row);
}

export async function moveReferral(args: { teamId: string; id: string; agentId: string; move: ReferralMove; amount?: number | null }): Promise<Referral> {
  const { data: row } = await supabaseAdmin.from("team_referrals").select(COLS).eq("team_id", args.teamId).eq("id", args.id).maybeSingle();
  if (!row) throw new Error("not_found");
  const current = toReferral(row as Row);
  if (!movesFor(current, args.agentId).includes(args.move)) throw new Error("not_allowed");
  if (args.move === "close" && !(typeof args.amount === "number" && Number.isFinite(args.amount) && args.amount >= 0)) throw new Error("amount_required");
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: statusAfter(args.move), updated_at: now };
  if (args.move === "close") {
    patch.closed_amount = args.amount;
    patch.closed_at = now;
  } else patch.responded_at = now;
  const { data, error } = await supabaseAdmin.from("team_referrals").update(patch as never).eq("id", args.id).eq("team_id", args.teamId).select(COLS).single();
  if (error) throw new Error(error.message);
  return toReferral(data as Row);
}
