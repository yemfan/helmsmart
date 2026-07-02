import { supabaseServer } from "@/lib/supabaseServer";

type LeadType = "seller" | "buyer";

// contacts.id is a uuid since the contacts consolidation. Legacy
// lead_sequences rows may still hold numeric ids as text, but new
// enrollments must always key off a uuid contact id.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function inferLeadType(input: any): LeadType {
  const raw = String(input?.lead_type ?? "").toLowerCase();
  if (raw === "buyer" || raw === "refinance") return "buyer";

  const source = String(input?.source ?? "").toLowerCase();
  if (source.includes("mortgage") || source.includes("rate")) return "buyer";

  return "seller";
}

const STEPS: Array<{ dayOffset: number; channel: "email" | "sms" }> = [
  { dayOffset: 0, channel: "email" },
  { dayOffset: 1, channel: "sms" },
  { dayOffset: 3, channel: "email" },
  { dayOffset: 5, channel: "sms" },
  { dayOffset: 7, channel: "email" },
];

const STEPS_SKIP_DAY0: Array<{ dayOffset: number; channel: "email" | "sms" }> = [
  { dayOffset: 1, channel: "sms" },
  { dayOffset: 3, channel: "email" },
  { dayOffset: 5, channel: "sms" },
  { dayOffset: 7, channel: "email" },
];

async function ensureTemplates(leadType: LeadType) {
  const { data, error } = await supabaseServer
    .from("message_templates")
    .select("id,channel")
    .eq("lead_type", leadType)
    .in("channel", ["email", "sms"]);

  if (error) throw error;

  const byChannel = new Map<string, string>();
  (data ?? []).forEach((r: any) => byChannel.set(String(r.channel).toLowerCase(), String(r.id)));

  const emailTemplateId = byChannel.get("email") ?? null;
  const smsTemplateId = byChannel.get("sms") ?? null;

  if (!emailTemplateId || !smsTemplateId) {
    throw new Error(`Missing message_templates for lead_type=${leadType}`);
  }

  return { emailTemplateId, smsTemplateId };
}

async function upsertLeadSequence(contactId: string, steps: typeof STEPS, leadType: LeadType, nextSendAt: Date) {
  const { data: existingSeq, error: seqErr } = await supabaseServer
    .from("lead_sequences")
    .select("id")
    .eq("lead_id", contactId)
    .maybeSingle();

  if (seqErr && (seqErr as any).code !== "PGRST116") throw seqErr;

  let sequenceId: string;
  if (existingSeq?.id) {
    sequenceId = String(existingSeq.id);
    await supabaseServer
      .from("lead_sequences")
      .update({
        status: "active",
        current_step: 0,
        next_send_at: nextSendAt.toISOString(),
      })
      .eq("id", sequenceId);

    await supabaseServer.from("sequence_steps").delete().eq("sequence_id", sequenceId);
  } else {
    const { data: insSeq, error: insSeqErr } = await supabaseServer
      .from("lead_sequences")
      .insert({
        lead_id: contactId,
        status: "active",
        current_step: 0,
        next_send_at: nextSendAt.toISOString(),
      })
      .select("id")
      .single();
    if (insSeqErr) throw insSeqErr;
    sequenceId = String(insSeq?.id ?? "");
    if (!sequenceId) return;
  }

  const { emailTemplateId, smsTemplateId } = await ensureTemplates(leadType);

  const stepsRows = steps.map((s) => ({
    sequence_id: sequenceId,
    day_offset: s.dayOffset,
    channel: s.channel,
    template_id: s.channel === "email" ? emailTemplateId : smsTemplateId,
    sent: false,
  }));

  const { error: stepsErr } = await supabaseServer.from("sequence_steps").insert(stepsRows as any);
  if (stepsErr) throw stepsErr;

  await supabaseServer
    .from("contacts")
    .update({
      automation_disabled: true,
      next_contact_at: nextSendAt.toISOString(),
    } as any)
    .eq("id", contactId);
}

async function scheduleSequence(leadId: string, steps: typeof STEPS) {
  const contactId = String(leadId ?? "").trim();
  if (!UUID_RE.test(contactId)) return;

  const now = new Date();

  const { data: lead, error: leadErr } = await supabaseServer
    .from("contacts")
    .select("id,lead_type,source,stage,created_at")
    .eq("id", contactId)
    .maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return;

  const leadType = inferLeadType(lead);
  const nextSendAt = new Date(now);
  nextSendAt.setDate(now.getDate() + steps[0].dayOffset);

  await upsertLeadSequence(contactId, steps, leadType, nextSendAt);
}

export async function scheduleEmailSequenceForLead(leadId: string) {
  // Enrollment is best-effort: it must never break the lead-capture
  // endpoints, several of which call this without their own try/catch.
  try {
    await scheduleSequence(leadId, STEPS);
  } catch (e) {
    console.error("scheduleEmailSequenceForLead failed", { leadId }, e);
  }
}

// Used when we already send an email immediately (so we don't duplicate "day 0").
export async function scheduleEmailSequenceForLeadSkipDay0(leadId: string) {
  try {
    await scheduleSequence(leadId, STEPS_SKIP_DAY0);
  } catch (e) {
    console.error("scheduleEmailSequenceForLeadSkipDay0 failed", { leadId }, e);
  }
}
