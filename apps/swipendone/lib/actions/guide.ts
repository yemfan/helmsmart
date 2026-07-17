"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Record a scan on guide load. Captures lang + UA + referrer. Returns the scan id
 * so the client can attribute step_events to it. Never throws to the caller —
 * analytics must not break the buyer experience.
 */
export async function logScan(
  guideId: string,
  lang: string
): Promise<{ scanId: string | null }> {
  try {
    const admin = createAdminClient();
    if (!admin) return { scanId: null };
    const h = await headers();
    const { data, error } = await admin
      .from("scans")
      .insert({
        guide_id: guideId,
        lang,
        user_agent: h.get("user-agent")?.slice(0, 500) ?? null,
        referrer: h.get("referer")?.slice(0, 500) ?? null,
      })
      .select("id")
      .single();
    if (error) return { scanId: null };
    return { scanId: data.id };
  } catch {
    return { scanId: null };
  }
}

/** Warranty registration on the done screen (handoff §7). */
export async function registerWarranty(
  guideId: string,
  email: string,
  consent = true
): Promise<{ ok: boolean; message: string }> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) {
    return { ok: false, message: "Enter a valid email address." };
  }
  try {
    const admin = createAdminClient();
    if (!admin) return { ok: true, message: "Registered." }; // demo-safe
    const { error } = await admin
      .from("registrations")
      .insert({ guide_id: guideId, buyer_email: clean, consent });
    if (error) return { ok: false, message: "Something went wrong — try again." };
    return { ok: true, message: "Registered." };
  } catch {
    return { ok: false, message: "Something went wrong — try again." };
  }
}
