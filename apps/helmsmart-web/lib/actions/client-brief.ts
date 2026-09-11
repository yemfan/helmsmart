"use server";

import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { languageDirectiveForJson } from "@/lib/i18n/directives";
import { DEFAULT_LOCALE, intlLocale } from "@leadsmart/i18n";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ClientBrief {
  headline: string;
  summary: string;
  nextAction?: string;
  healthScore?: number;
  healthLabel?: string;
  keyFacts: Array<{ label: string; value: string }>;
  generatedAt: string;
  isStale: boolean; // true if older than 24 hours
}

/**
 * Get a cached AI brief for a client, or generate a new one.
 */
export async function getClientBrief(clientId: string): Promise<ClientBrief | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return null;

  const supabase = await createClient();
  const { data: cached } = await supabase
    .from("client_ai_briefs")
    .select("*")
    .eq("organization_id", orgId)
    .eq("client_id", clientId)
    .single();

  if (!cached) return null;
  // A brief is prose in the language of whoever asked for it; one in another
  // language is not this reader's brief. Briefs from before the column existed
  // were English.
  if ((cached.locale ?? DEFAULT_LOCALE) !== (await getServerLocale())) return null;

  const ageHours =
    (Date.now() - new Date(cached.generated_at).getTime()) / 3_600_000;

  return {
    headline:    cached.headline,
    summary:     cached.summary,
    nextAction:  cached.next_action ?? undefined,
    healthScore: cached.health_score ?? undefined,
    healthLabel: cached.health_label ?? undefined,
    keyFacts:    (cached.key_facts ?? []) as Array<{ label: string; value: string }>,
    generatedAt: cached.generated_at,
    isStale:     ageHours > 24,
  };
}

/**
 * Generate (or refresh) an AI brief for a client using Claude.
 * Collects all available context, calls Claude, stores result.
 */
export async function generateClientBrief(
  clientId: string
): Promise<{ ok: boolean; brief?: ClientBrief; error?: string }> {
  const [t, locale] = await Promise.all([getServerT("clients"), getServerLocale()]);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value;
  if (!orgId) return { ok: false, error: t("errors.unauthorized") };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: t("errors.aiNotConfigured") };

  const supabase = await createClient();
  const db = await createServiceClient();

  // ── Gather context ──────────────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);

  const [
    clientRes,
    invoicesRes,
    estimatesRes,
    tasksRes,
    eventsRes,
    communicationsRes,
    projectsRes,
    notesRes,
  ] = await Promise.all([
    supabase
      .from("clients")
      .select("first_name, last_name, company, email, phone, status, source, tags, lifetime_value, created_at, notes")
      .eq("id", clientId)
      .eq("organization_id", orgId)
      .single(),
    supabase
      .from("invoices")
      .select("invoice_number, status, total, issue_date, due_date, paid_at")
      .eq("client_id", clientId)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("estimates")
      .select("estimate_number, status, total, issue_date, expiry_date")
      .eq("client_id", clientId)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("tasks")
      .select("title, status, priority, due_date")
      .eq("client_id", clientId)
      .eq("organization_id", orgId)
      .in("status", ["open", "in_progress"])
      .order("due_date", { ascending: true })
      .limit(5),
    supabase
      .from("events")
      .select("title, type, start_at")
      .eq("client_id", clientId)
      .eq("organization_id", orgId)
      .gte("start_at", new Date().toISOString())
      .order("start_at", { ascending: true })
      .limit(3),
    supabase
      .from("communication_logs")
      .select("type, direction, sentiment, ai_summary, body, created_at")
      .eq("client_id", clientId)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("projects")
      .select("name, status, end_date")
      .eq("client_id", clientId)
      .eq("organization_id", orgId)
      .in("status", ["active", "paused"])
      .limit(5),
    supabase
      .from("client_notes")
      .select("body, created_at")
      .eq("client_id", clientId)
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  if (!clientRes.data) return { ok: false, error: t("errors.clientNotFound") };
  const client = clientRes.data;

  // ── Build context string for Claude ────────────────────────────────────────

  const invoices  = invoicesRes.data ?? [];
  const estimates = estimatesRes.data ?? [];
  const tasks     = tasksRes.data ?? [];
  const events    = eventsRes.data ?? [];
  const comms     = communicationsRes.data ?? [];
  const projects  = projectsRes.data ?? [];
  const notes     = notesRes.data ?? [];

  const clientName =
    [client.first_name, client.last_name].filter(Boolean).join(" ") ||
    client.company ||
    t("detail.fallbackName");

  const totalPaid = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + Number(i.total), 0);
  const totalOutstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + Number(i.total), 0);
  const overdueInvoices = invoices.filter(
    (i) => i.status === "overdue" || (i.status === "sent" && i.due_date < today)
  );

  const fmt = (n: number) =>
    new Intl.NumberFormat(intlLocale(locale), { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

  // Invoices are spelled out for the model. Given a bare "DRAFT $350 due
  // 2026-10-11" it wrote "overdue on October 10": a draft has not been sent, so
  // it cannot be late, and a due date is stated relative to today so there is
  // no date arithmetic left for it to get wrong.
  const daysFromToday = (date: string) => Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  const dueNote = (date: string) => {
    const days = daysFromToday(date);
    if (days === 0) return `due today (${date})`;
    return days > 0 ? `due ${date}, in ${days} day(s)` : `due ${date}, ${-days} day(s) ago`;
  };
  const invoiceLine = (i: { invoice_number: string; status: string; total: number | string; due_date: string }) =>
    i.status === "draft"
      ? `- ${i.invoice_number}: DRAFT, not sent to the client yet, ${fmt(Number(i.total))}, due date set to ${i.due_date}`
      : `- ${i.invoice_number}: ${i.status.toUpperCase()} ${fmt(Number(i.total))}, ${dueNote(i.due_date)}`;

  const contextParts: string[] = [
    `## Client: ${clientName}`,
    // The app's own label for the status, in the reader's language — given the
    // raw "lead", the model translated it itself ("Cliente potencial") and
    // disagreed with every other screen ("Contacto nuevo").
    `Status: ${t(`statuses.${client.status}`, { defaultValue: client.status })} | Source: ${client.source ?? "unknown"} | Member since: ${client.created_at.slice(0, 10)}`,
    client.tags?.length ? `Tags: ${(client.tags as string[]).join(", ")}` : "",
    client.notes ? `Notes on file: "${client.notes}"` : "",
    "",
    `## Financial Summary`,
    `Lifetime value: ${fmt(Number(client.lifetime_value ?? 0))}`,
    `Total paid: ${fmt(totalPaid)} | Outstanding: ${fmt(totalOutstanding)}`,
    overdueInvoices.length
      ? `⚠️ OVERDUE: ${overdueInvoices.length} invoice(s) totaling ${fmt(overdueInvoices.reduce((s, i) => s + Number(i.total), 0))}`
      : "No overdue invoices.",
    "",
    `## Recent Invoices (last 10)`,
    invoices.length
      ? invoices
          .slice(0, 5)
          .map(invoiceLine)
          .join("\n")
      : "No invoices.",
    "",
    `## Open Estimates`,
    estimates.filter((e) => e.status === "sent").length
      ? estimates
          .filter((e) => e.status === "sent")
          .map((e) => `- ${e.estimate_number}: ${fmt(Number(e.total))} (expires ${e.expiry_date})`)
          .join("\n")
      : "No open estimates.",
    "",
    `## Active Projects`,
    projects.length
      ? projects.map((p) => `- ${p.name} (${p.status}${p.end_date ? `, due ${p.end_date}` : ""})`).join("\n")
      : "No active projects.",
    "",
    `## Open Tasks`,
    tasks.length
      ? tasks.map((t) => `- [${t.priority}] ${t.title}${t.due_date ? ` (due ${t.due_date})` : ""}`).join("\n")
      : "No open tasks.",
    "",
    `## Upcoming Events`,
    events.length
      ? events
          .map((e) => `- ${e.title} on ${new Date(e.start_at).toLocaleDateString(intlLocale(locale), { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`)
          .join("\n")
      : "No upcoming appointments.",
    "",
    `## Recent Communications (last 10)`,
    comms.length
      ? comms
          .map(
            (c) =>
              `- [${c.type}/${c.direction ?? "n/a"}] ${c.ai_summary || c.body?.slice(0, 80) || "(no content)"} (${c.created_at.slice(0, 10)})${c.sentiment ? ` [${c.sentiment}]` : ""}`
          )
          .join("\n")
      : "No communication history.",
    "",
    `## Notes`,
    notes.length
      ? notes.map((n) => `- "${n.body.slice(0, 150)}" (${n.created_at.slice(0, 10)})`).join("\n")
      : "No notes.",
  ];

  const contextStr = contextParts.filter(Boolean).join("\n");

  // ── Call Claude ─────────────────────────────────────────────────────────────

  const systemPrompt =
    `You are an AI business advisor analyzing a client relationship for a small business owner.
Be direct, concise, and actionable. Focus on what matters most right now.
Today's date: ${today}` + languageDirectiveForJson(locale);

  const userPrompt = `Analyze this client and produce a JSON brief. Be concise and business-focused.

${contextStr}

Respond with ONLY valid JSON (no markdown, no comments):
{
  "headline": "One sentence describing the current state of this relationship (max 120 chars)",
  "summary": "2-3 short paragraphs. Cover: (1) relationship overview and history, (2) current financial/project status, (3) any risks or opportunities",
  "next_action": "The single most important thing the business should do with this client right now (1 sentence)",
  "health_score": <integer 1-10, where 1=at risk, 10=excellent>,
  "health_label": <a code, exactly one of these English values whatever language the rest is in: "At risk" | "Needs attention" | "Good" | "Strong" | "Excellent">,
  "key_facts": [
    {"label": "Lifetime value", "value": "$X,XXX"},
    {"label": "Last contact", "value": "X days ago"},
    {"label": "Open invoices", "value": "X totaling $X"},
    {"label": "Status", "value": "..."}
  ]
}`;

  let rawText = "";
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    rawText = (response.content[0] as { type: string; text: string }).text ?? "";
  } catch (e) {
    console.error("[client-brief] Claude error:", e);
    return { ok: false, error: t("errors.briefFailed") };
  }

  // ── Parse response ──────────────────────────────────────────────────────────

  let parsed: {
    headline: string;
    summary: string;
    next_action?: string;
    health_score?: number;
    health_label?: string;
    key_facts?: Array<{ label: string; value: string }>;
  };

  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] ?? rawText);
  } catch {
    return { ok: false, error: t("errors.briefParseFailed") };
  }

  // ── Persist ─────────────────────────────────────────────────────────────────

  const now = new Date().toISOString();

  const { error: upsertErr } = await db.from("client_ai_briefs").upsert(
    {
      organization_id: orgId,
      client_id:       clientId,
      headline:        parsed.headline ?? t("brief.noHeadline"),
      summary:         parsed.summary ?? "",
      next_action:     parsed.next_action ?? null,
      health_score:    parsed.health_score ?? null,
      health_label:    parsed.health_label ?? null,
      key_facts:       parsed.key_facts ?? [],
      model:           "claude-haiku-4-5",
      generated_at:    now,
      locale,
    },
    { onConflict: "organization_id,client_id" }
  );

  if (upsertErr) {
    console.error("[client-brief] upsert error:", upsertErr);
    return { ok: false, error: t("errors.briefSaveFailed") };
  }

  revalidatePath(`/clients/${clientId}`);

  const brief: ClientBrief = {
    headline:    parsed.headline,
    summary:     parsed.summary,
    nextAction:  parsed.next_action,
    healthScore: parsed.health_score,
    healthLabel: parsed.health_label,
    keyFacts:    parsed.key_facts ?? [],
    generatedAt: now,
    isStale:     false,
  };

  return { ok: true, brief };
}
