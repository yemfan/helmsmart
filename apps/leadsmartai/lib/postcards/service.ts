import "server-only";

import { sendEmail } from "@/lib/email";
import { sendSMS } from "@/lib/twilioSms";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generatePostcardSlug } from "./slug";
import { getPostcardTemplate, type PostcardTemplateKey } from "./templates";
import { renderPostcardEmail } from "./renderEmail";
import type { PostcardSendRow, PublicPostcardView } from "./types";

/**
 * Sphere outreach postcard service — agent-scoped. The twin
 * module `publicService` below is explicitly unauthenticated (slug
 * is the capability) and lives adjacent for the trust-boundary
 * clarity.
 */

const DEFAULT_APP_BASE_URL = "https://www.realtybossai.com";

export type Channel = "email" | "sms" | "wechat";

export type CreateSendInput = {
  agentId: string;
  contactId?: string | null;
  templateKey: PostcardTemplateKey;
  recipientName: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  personalMessage?: string | null;
  channels: Channel[];
};

export type CreateSendResult = {
  send: PostcardSendRow;
  publicUrl: string;
  deliveries: Record<Channel, { ok: boolean; reason?: string }>;
};

/**
 * Create a send row + immediately dispatch on every requested
 * channel. Each channel is best-effort; one failure doesn't abort
 * the others.
 */
export async function createPostcardSend(
  input: CreateSendInput,
): Promise<CreateSendResult> {
  const template = getPostcardTemplate(input.templateKey);
  if (!template) throw new Error(`Unknown postcard template: ${input.templateKey}`);
  if (!input.recipientName?.trim()) {
    throw new Error("Recipient name is required");
  }
  if (!input.channels.length) {
    throw new Error("Pick at least one delivery channel");
  }

  const personalMessage = input.personalMessage?.trim() || template.defaultMessage;

  // Slug generation with retry on the (astronomically unlikely)
  // unique collision.
  let send: PostcardSendRow | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const slug = generatePostcardSlug();
    const { data, error } = await supabaseAdmin
      .from("postcard_sends")
      .insert({
        agent_id: input.agentId,
        contact_id: input.contactId ?? null,
        template_key: input.templateKey,
        slug,
        recipient_name: input.recipientName.trim(),
        recipient_email: (input.recipientEmail ?? "").trim() || null,
        recipient_phone: (input.recipientPhone ?? "").trim() || null,
        personal_message: personalMessage,
        channels: input.channels,
      })
      .select("*")
      .single();
    if (!error && data) {
      send = data as PostcardSendRow;
      break;
    }
    if ((error as { code?: string } | null)?.code !== "23505") {
      throw new Error(error?.message ?? "Failed to save postcard");
    }
  }
  if (!send) throw new Error("Could not generate a unique postcard slug");

  const appBaseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? DEFAULT_APP_BASE_URL;
  const publicUrl = `${appBaseUrl}/postcard/${send.slug}`;

  const agentInfo = await resolveAgentDisplay(input.agentId);

  const deliveries: Record<Channel, { ok: boolean; reason?: string }> = {
    email: { ok: false, reason: "not requested" },
    sms: { ok: false, reason: "not requested" },
    wechat: { ok: false, reason: "not requested" },
  };

  // ── Email ──
  if (input.channels.includes("email")) {
    if (!send.recipient_email) {
      deliveries.email = { ok: false, reason: "no email on file" };
      await stampChannelError(send.id, "email", "no email on file");
    } else {
      try {
        const { subject, html, text } = renderPostcardEmail({
          template,
          recipientName: send.recipient_name,
          personalMessage,
          publicUrl,
          agentName: agentInfo.name,
          agentPhotoUrl: agentInfo.photoUrl,
          brandName: agentInfo.brandName,
        });
        await sendEmail({ to: send.recipient_email, subject, text, html });
        deliveries.email = { ok: true };
        await stampChannelSent(send.id, "email");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "email error";
        deliveries.email = { ok: false, reason: msg };
        await stampChannelError(send.id, "email", msg);
      }
    }
  }

  // ── SMS ──
  if (input.channels.includes("sms")) {
    if (!send.recipient_phone) {
      deliveries.sms = { ok: false, reason: "no phone on file" };
      await stampChannelError(send.id, "sms", "no phone on file");
    } else {
      try {
        const from = agentInfo.name ? ` — ${agentInfo.name}` : "";
        const sms =
          `${template.emojiBadge} ${template.title}, ${send.recipient_name}! ` +
          `You have a postcard: ${publicUrl}${from}`;
        await sendSMS(send.recipient_phone, sms);
        deliveries.sms = { ok: true };
        await stampChannelSent(send.id, "sms");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "sms error";
        deliveries.sms = { ok: false, reason: msg };
        await stampChannelError(send.id, "sms", msg);
      }
    }
  }

  // ── WeChat (stub) ──
  if (input.channels.includes("wechat")) {
    // WeChat Official Account integration is gated on JV
    // registration — write the intent but don't fire any network
    // call yet. The DB row captures it so we can back-fill
    // delivery when the integration lands.
    deliveries.wechat = {
      ok: false,
      reason: "WeChat delivery not yet enabled — link will be sent when integration lands",
    };
    await stampChannelError(
      send.id,
      "wechat",
      "pending_jv_integration",
    );
  }

  return { send, publicUrl, deliveries };
}

export async function listPostcardsForAgent(
  agentId: string,
  opts?: { contactId?: string | null; limit?: number },
): Promise<PostcardSendRow[]> {
  let q = supabaseAdmin
    .from("postcard_sends")
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.contactId) q = q.eq("contact_id", opts.contactId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as PostcardSendRow[];
}

export async function deletePostcardSend(
  agentId: string,
  id: string,
): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("postcard_sends")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("agent_id", agentId);
  if (error) throw new Error(error.message);
  return (count ?? 0) > 0;
}

// ── Public (unauth) ────────────────────────────────────────────────

export async function getPublicPostcardBySlug(
  slug: string,
): Promise<PublicPostcardView | null> {
  const { data } = await supabaseAdmin
    .from("postcard_sends")
    .select(
      "template_key, recipient_name, personal_message, agent_id",
    )
    .eq("slug", slug)
    .maybeSingle();
  const row = data as {
    template_key: PostcardTemplateKey;
    recipient_name: string;
    personal_message: string | null;
    agent_id: string;
  } | null;
  if (!row) return null;

  const tpl = getPostcardTemplate(row.template_key);
  if (!tpl) return null;

  const agent = await resolveAgentDisplay(row.agent_id);
  return {
    templateKey: row.template_key,
    recipientName: row.recipient_name,
    personalMessage: row.personal_message ?? tpl.defaultMessage,
    agentName: agent.name,
    agentPhotoUrl: agent.photoUrl,
    brandName: agent.brandName,
    agentEmail: agent.email,
    agentPhone: agent.phone,
  };
}

/**
 * Stamp `opened_at` (first time) + bump `open_count`. Called from
 * the public viewer page's beacon endpoint — best-effort, failures
 * are silent.
 */
export async function markPostcardOpened(slug: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from("postcard_sends")
    .select("id, opened_at, open_count")
    .eq("slug", slug)
    .maybeSingle();
  const row = data as {
    id: string;
    opened_at: string | null;
    open_count: number;
  } | null;
  if (!row) return;
  await supabaseAdmin
    .from("postcard_sends")
    .update({
      opened_at: row.opened_at ?? new Date().toISOString(),
      open_count: (row.open_count ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}

// ── Helpers ────────────────────────────────────────────────────────

async function stampChannelSent(id: string, channel: Channel): Promise<void> {
  const col = `${channel}_sent_at` as const;
  await supabaseAdmin
    .from("postcard_sends")
    .update({ [col]: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id);
}

async function stampChannelError(
  id: string,
  channel: Channel,
  reason: string,
): Promise<void> {
  const col = `${channel}_error` as const;
  await supabaseAdmin
    .from("postcard_sends")
    .update({ [col]: reason.slice(0, 300), updated_at: new Date().toISOString() })
    .eq("id", id);
}

async function resolveAgentDisplay(agentId: string): Promise<{
  name: string | null;
  email: string | null;
  phone: string | null;
  photoUrl: string | null;
  brandName: string | null;
}> {
  // First get the auth user id from agents.
  const { data: agentRow } = await supabaseAdmin
    .from("agents")
    .select("auth_user_id")
    .eq("id", agentId)
    .maybeSingle();
  const authUserId = (agentRow as { auth_user_id: string | null } | null)
    ?.auth_user_id ?? null;

  let email: string | null = null;
  let name: string | null = null;
  let phone: string | null = null;
  let photoUrl: string | null = null;
  let brandName: string | null = null;

  if (authUserId) {
    try {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(authUserId);
      email = authUser?.user?.email ?? null;
      const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, unknown>;
      if (typeof meta.full_name === "string") name = meta.full_name.trim();
    } catch {
      /* ignore */
    }

    try {
      const { data: profile } = await supabaseAdmin
        .from("user_profiles")
        .select("full_name, phone, avatar_url, brokerage")
        .eq("user_id", authUserId)
        .maybeSingle();
      const p = profile as {
        full_name?: string | null;
        phone?: string | null;
        avatar_url?: string | null;
        brokerage?: string | null;
      } | null;
      if (!name && p?.full_name) name = p.full_name;
      if (p?.phone) phone = p.phone;
      if (p?.avatar_url) photoUrl = p.avatar_url;
      if (p?.brokerage) brandName = p.brokerage;
    } catch {
      /* ignore */
    }
  }

  return { name, email, phone, photoUrl, brandName };
}
