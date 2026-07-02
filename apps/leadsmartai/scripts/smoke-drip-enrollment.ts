/**
 * Dry-run for the drip rail end-to-end against uuid contacts.
 *
 * Exercises the REAL enrollment function (lib/emailSequences) and then replays
 * the send-emails cron's selection + step-resolution logic — WITHOUT sending any
 * email/SMS — to prove that a new uuid-keyed lead is enrolled and becomes due.
 * Also regression-checks the UUID guard that replaced the old `Number(leadId)`
 * check that silently no-op'd every enrollment after the contacts consolidation.
 *
 * Usage (from repo root):
 *   npm run smoke:drip-enrollment -w leadsmartai
 *
 * Env: apps/leadsmartai/.env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 * Creates a throwaway contact and deletes it (plus its sequence rows) on exit.
 */

import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../../leadsmart-mobile/.env.local"), override: true });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let failures = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`✓ ${label}`);
  } else {
    failures++;
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || key === "DUMMY_SUPABASE_SERVICE_ROLE_KEY") {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (check apps/leadsmartai/.env.local)");
    process.exitCode = 1;
    return;
  }
  const supabase = createClient(url, key);

  // Import the real enrollment function AFTER env is set (supabaseServer reads env at import time).
  const { scheduleEmailSequenceForLead, scheduleEmailSequenceForLeadSkipDay0 } = await import(
    "@/lib/emailSequences"
  );

  let contactId: string | null = null;
  let sequenceId: string | null = null;

  try {
    // 1) Throwaway uuid contact (all other NOT NULL columns default).
    const stamp = Date.now();
    const { data: created, error: insErr } = await supabase
      .from("contacts")
      .insert({
        email: `drip-smoke+${stamp}@example.test`,
        name: "Drip Smoke",
        lead_type: "seller",
        source: "drip-smoke-test",
      } as Record<string, unknown>)
      .select("id")
      .single();
    if (insErr) throw new Error(`contact insert failed: ${insErr.message}`);
    contactId = String(created!.id);
    check("created throwaway uuid contact", UUID_RE.test(contactId), contactId);

    // 2) Real enrollment (the exact call the lead-capture endpoints make).
    await scheduleEmailSequenceForLead(contactId);

    // 3) A lead_sequences row keyed by the uuid contact id must now exist.
    const { data: seq } = await supabase
      .from("lead_sequences")
      .select("id,lead_id,status,current_step,next_send_at")
      .eq("lead_id", contactId)
      .maybeSingle();
    check("enrollment created a lead_sequences row", !!seq, "no row found for contact");
    if (seq) {
      sequenceId = String(seq.id);
      check("sequence is active", seq.status === "active", `status=${seq.status}`);
      check("sequence keyed by uuid contact id (text)", String(seq.lead_id) === contactId);
    }

    // 4) sequence_steps must be seeded (5-step full sequence, day 0 email first).
    const { data: steps } = await supabase
      .from("sequence_steps")
      .select("id,day_offset,channel,sent,template_id")
      .eq("sequence_id", sequenceId)
      .order("day_offset", { ascending: true });
    check("sequence_steps seeded", (steps ?? []).length === 5, `count=${(steps ?? []).length}`);
    const first = (steps ?? [])[0];
    check("first step is day 0 email, unsent", !!first && first.day_offset === 0 && first.channel === "email" && first.sent === false);

    // 5) Replay the cron's selection logic (read-only, no sends).
    const nowIso = new Date().toISOString();
    const { data: due } = await supabase
      .from("lead_sequences")
      .select("id,lead_id,status,next_send_at")
      .eq("status", "active")
      .lte("next_send_at", nowIso)
      .limit(500);
    const picked = (due ?? []).find((r: any) => String(r.id) === sequenceId);
    check("cron SELECT picks up the new sequence (next_send_at <= now)", !!picked);
    check("cron would accept the lead_id via UUID guard", !!picked && UUID_RE.test(String(picked.lead_id)));

    // 6) Cron resolves the contact + a due step with a renderable template.
    if (picked) {
      const { data: lead } = await supabase
        .from("contacts")
        .select("id,name,email,lead_type,source")
        .eq("id", String(picked.lead_id))
        .maybeSingle();
      check("cron resolves the contact from lead_id", !!lead && String(lead.id) === contactId);

      const { data: stepRows } = await supabase
        .from("sequence_steps")
        .select("id,day_offset,channel,template:template_id(template_text)")
        .eq("sequence_id", sequenceId)
        .eq("sent", false)
        .order("day_offset", { ascending: true })
        .limit(1);
      const step: any = (stepRows ?? [])[0];
      const tNode: any = step?.template ?? {};
      const templateText = Array.isArray(tNode) ? tNode[0]?.template_text : tNode?.template_text;
      check("cron resolves first unsent step + template_text", !!step && !!templateText, "no template joined");
    }

    // 7) The message_logs guards the cron runs must query contact_id, not lead_id.
    const { error: mlErr } = await supabase
      .from("message_logs")
      .select("id")
      .eq("contact_id", contactId)
      .limit(1);
    check("message_logs.contact_id is queryable (rename applied)", !mlErr, mlErr?.message);

    // 8) Regression: the old bug. Numeric / non-uuid ids must NOT enroll.
    const beforeCount = (await supabase.from("lead_sequences").select("id", { count: "exact", head: true } as any)).count ?? 0;
    await scheduleEmailSequenceForLead("5"); // legacy bigint id — must be rejected by the guard
    await scheduleEmailSequenceForLeadSkipDay0("not-a-uuid");
    const afterCount = (await supabase.from("lead_sequences").select("id", { count: "exact", head: true } as any)).count ?? 0;
    check("non-uuid ids are rejected (no new sequences created)", afterCount === beforeCount, `before=${beforeCount} after=${afterCount}`);
  } finally {
    // Cleanup — best effort, in FK order.
    if (sequenceId) {
      await supabase.from("sequence_steps").delete().eq("sequence_id", sequenceId);
      await supabase.from("lead_sequences").delete().eq("id", sequenceId);
    }
    if (contactId) {
      await supabase.from("message_logs").delete().eq("contact_id", contactId);
      await supabase.from("contacts").delete().eq("id", contactId);
    }
  }

  console.log("");
  if (failures === 0) {
    console.log("✓ Drip enrollment + cron selection work end-to-end for uuid contacts.");
  } else {
    console.error(`✗ ${failures} check(s) failed.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
