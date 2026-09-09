"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { enforceAutonomy } from "@/lib/workforce-gating";
import { normalizePhoneE164 } from "@/lib/phone";

async function orgScope() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) throw new Error((await getServerT("home"))("errors.notAuthenticated"));
  return orgId;
}

/**
 * Ask Sarah to draft a personalized follow-up SMS for a pipeline lead. Because
 * Sarah is act_with_approval, nothing is sent — instead a to-do task lands in the
 * owner's Tasks list with the drafted message to send manually.
 * Returns "queued" on success (task created), "no_sarah" if Emma isn't seeded,
 * "no_phone" if the lead has no number, or "error" for unexpected failures.
 */
export async function letSarahFollowUp(
  clientId: string,
): Promise<{ status: "queued" | "no_sarah" | "no_phone" | "error" }> {
  const orgId = await orgScope();
  const supabase = await createClient();
  const serviceDb = await createServiceClient();

  const { data: client } = await supabase
    .from("clients")
    .select("id, first_name, last_name, company, phone, pipeline_stage, expected_value, stage_changed_at")
    .eq("id", clientId)
    .eq("organization_id", orgId)
    .single();
  if (!client) throw new Error((await getServerT("home"))("errors.clientNotFound"));

  const phoneResult = normalizePhoneE164((client.phone as string | null) ?? "");
  if (!phoneResult.ok) return { status: "no_phone" };

  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).single();
  const orgName = (org?.name as string) ?? "us";

  const clientName =
    [(client.first_name as string | null), (client.last_name as string | null)].filter(Boolean).join(" ") ||
    (client.company as string | null) ||
    "there";
  const days = Math.floor((Date.now() - new Date(client.stage_changed_at as string).getTime()) / 86_400_000);
  const stage = (client.pipeline_stage as string) ?? "lead";
  const value = client.expected_value as number | null;

  // Template for the owner to review and approve — no AI generation.
  const draftBody = `Hi ${clientName}! Checking in from ${orgName} — would love to connect and see how we can help. Available for a quick chat this week? — ${orgName}`;

  const result = await enforceAutonomy(serviceDb, orgId, "sarah", {
    runInput: { channel: "sms", subjectType: "contact", subjectId: clientId },
    approvalSubject: { clientName, stage, daysInStage: days, expectedValue: value, phone: phoneResult.value },
    toolKey: "communication.send_sms",
    toolInput: { to: phoneResult.value, body: draftBody, clientId, clientName },
    description: `Follow up with ${clientName} (${stage}, ${days}d in stage) — text them`,
    taskNote: `Sarah drafted this SMS for ${phoneResult.value}:\n\n"${draftBody}"`,
    // Sarah is act_with_approval — this callback is never called.
    execute: async () => ({ value: null }),
  }).catch(() => ({ status: "no_employee" as const }));

  if (result.status === "no_employee") return { status: "no_sarah" };
  if (result.status === "escalated") {
    revalidatePath("/tasks");
    return { status: "queued" };
  }
  return { status: "error" };
}

// ─── Alex — Finance ────────────────────────────────────────────────────────────

/** Ask Alex to queue payment reminder emails for all overdue invoices. */
export async function letAlexRemind(): Promise<{ status: "queued" | "no_alex" | "no_overdue" | "error" }> {
  const orgId = await orgScope();
  const supabase = await createClient();
  const serviceDb = await createServiceClient();

  const today = new Date().toISOString().slice(0, 10);
  const { data: raw } = await supabase
    .from("invoices")
    .select("id, invoice_number, total, due_date, clients(first_name, last_name, company, email)")
    .eq("organization_id", orgId)
    .eq("status", "sent")
    .lt("due_date", today)
    .limit(20);

  type InvClient = { first_name?: string | null; last_name?: string | null; company?: string | null; email?: string | null } | null;
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const invoices = (raw ?? []).map((inv) => {
    const c = (Array.isArray(inv.clients) ? inv.clients[0] : inv.clients) as InvClient;
    return {
      id: inv.id as string,
      invoiceNumber: inv.invoice_number as string,
      clientName: [c?.first_name, c?.last_name].filter(Boolean).join(" ") || (c?.company ?? "Client"),
      clientEmail: (c?.email as string | null) ?? "",
      amount: fmt(Number(inv.total)),
      dueDate: inv.due_date as string,
    };
  }).filter((i) => i.clientEmail);

  if (!invoices.length) return { status: "no_overdue" };

  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).single();
  const orgName = (org?.name as string) ?? "us";

  const reminderList = invoices
    .map((i) => `• ${i.invoiceNumber} — ${i.clientName} (${i.clientEmail}), ${i.amount}, due ${i.dueDate}`)
    .join("\n");

  const result = await enforceAutonomy(serviceDb, orgId, "alex", {
    runInput: { channel: "email", subjectType: "invoice", subjectId: invoices[0].id },
    approvalSubject: { invoiceCount: invoices.length },
    toolKey: "finance.send_invoice_reminder",
    toolInput: { invoices, orgName },
    description: `Send payment reminders for ${invoices.length} overdue invoice${invoices.length > 1 ? "s" : ""}`,
    taskNote: `Alex flagged these overdue invoices to follow up on:\n\n${reminderList}`,
    execute: async () => ({ value: null }),
  }).catch(() => ({ status: "no_employee" as const }));

  if (result.status === "no_employee") return { status: "no_alex" };
  if (result.status === "escalated") { revalidatePath("/tasks"); return { status: "queued" }; }
  return { status: "error" };
}

// ─── Emily — Marketing ─────────────────────────────────────────────────────────

/**
 * Ask Emily to create a draft social post directly — no approval needed.
 * A draft is internal and reversible; the owner edits and publishes it manually
 * from the Social page. Only publishing (external) would warrant approval.
 */
export async function letEmilyDraftPost(): Promise<{ status: "created" | "error" }> {
  const orgId = await orgScope();
  const supabase = await createClient();

  const { data: org } = await supabase.from("organizations").select("name").eq("id", orgId).single();
  const orgName = (org?.name as string) ?? "us";

  const { error } = await supabase.from("social_posts").insert({
    organization_id: orgId,
    platform: "general",
    content: `We'd love to share something with our community at ${orgName}! ✏️ Edit this post before publishing.`,
    status: "draft",
    generated_by_ai: false,
    created_at: new Date().toISOString(),
  });

  if (error) return { status: "error" };
  revalidatePath("/social");
  return { status: "created" };
}

// ─── Mark — Operations ─────────────────────────────────────────────────────────

/**
 * Ask Mark to create a follow-up task directly — no approval needed. Task
 * creation is internal and reversible; gating it behind an approval would be
 * friction for zero benefit. Mark is autonomous for internal ops.
 */
export async function letMarkCreateTask(): Promise<{ status: "created" | "error" }> {
  const orgId = await orgScope();
  const supabase = await createClient();

  const dueDate = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

  /*
   * Written in the owner's language, not stored as a key. A task becomes their
   * record — they rename it, assign it, close it — so the text has to be
   * theirs from the moment it is created. A key would be resolved on every
   * later read and would silently overwrite an edit they made.
   */
  // `{ ns: "tasks" }` explicitly: this file binds `home` for its own errors,
  // and a task's copy belongs to the tasks surface.
  const t = await getServerT("home");

  const { error } = await supabase.from("tasks").insert({
    organization_id: orgId,
    title: t("generated.reviewOpenItems", { ns: "tasks" }),
    notes: t("generated.reviewOpenItemsNotes", { ns: "tasks" }),
    priority: "high",
    status: "open",
    due_date: dueDate,
  });

  if (error) return { status: "error" };
  revalidatePath("/tasks");
  return { status: "created" };
}
