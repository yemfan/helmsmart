"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { languageDirectiveForJson } from "@/lib/i18n/directives";
import { DEFAULT_LOCALE, intlLocale } from "@leadsmart/i18n";
import { getMemberOrgId } from "@/lib/auth/org-context";

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
  const orgId = await getMemberOrgId();
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
  const orgId = await getMemberOrgId();
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

  // Each line names its document ("Invoice", "Quote"): a bare "INV-0001:
  // Borrador" came back as "cotización en borrador".
  // Invoices and tasks are spelled out for the model; a task given only its
  // date came back as "vencida" (overdue) a week before it was due. Given a bare "DRAFT $350 due
  // 2026-10-11" it wrote "overdue on October 10": a draft has not been sent, so
  // it cannot be late, and a due date is stated relative to today so there is
  // no date arithmetic left for it to get wrong.
  // A date the model may repeat is written out the way the reader writes one,
  // weekday included ("viernes, 18 de septiembre de 2026"). The model copies
  // the format it is given — ISO dates ended up in the prose — and a weekday
  // inside the date is one it cannot pair with a different day.
  const withWeekday = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(intlLocale(locale), {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  // The app's own status word, so the prose does not quote "DRAFT" in English.
  const invoiceStatus = (status: string) => t(`invoiceStatus.${status}`, { defaultValue: status });
  const daysFromToday = (date: string) => Math.round((Date.parse(date) - Date.parse(today)) / 86_400_000);
  const dueNote = (date: string) => {
    const days = daysFromToday(date);
    if (days === 0) return `due today (${date})`;
    return days > 0 ? `due ${withWeekday(date)}, in ${days} day(s)` : `due ${withWeekday(date)}, ${-days} day(s) ago`;
  };
  const invoiceLine = (i: { invoice_number: string; status: string; total: number | string; due_date: string }) =>
    i.status === "draft"
      ? `- Invoice ${i.invoice_number}: ${invoiceStatus(i.status)} (a draft, not sent to the client yet), ${fmt(Number(i.total))}, due date set to ${withWeekday(i.due_date)}`
      : `- Invoice ${i.invoice_number}: ${invoiceStatus(i.status)}, ${fmt(Number(i.total))}, ${dueNote(i.due_date)}`;

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
    `## Open Quotes (estimates)`,
    estimates.filter((e) => e.status === "sent").length
      ? estimates
          .filter((e) => e.status === "sent")
          .map((e) => `- Quote ${e.estimate_number}: ${fmt(Number(e.total))} (expires ${e.expiry_date})`)
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
      ? tasks.map((t) => `- [${t.priority}] ${t.title}${t.due_date ? ` (${dueNote(t.due_date)})` : ""}`).join("\n")
      : "No open tasks.",
    "",
    `## Upcoming Events`,
    events.length
      ? events
          .map((e) => `- ${e.title} on ${new Date(e.start_at).toLocaleDateString(intlLocale(locale), { weekday: "long", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`)
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

  // The app's own words, so the brief agrees with the screen around it. Left
  // to itself the model wrote "valor de vida útil" (an asset's useful life),
  // "estimaciones" for quotes, and "lifetime value" in English mid-sentence.
  // Lowercased: given the bundles' title case, the model capitalised them
  // mid-sentence ("No hay Cotizaciones abiertas").
  const term = (key: string) => t(key).toLocaleLowerCase(intlLocale(locale));
  // The style guide's register for the owner; left unsaid, the next action
  // came out in tú ("Confirma la cita") in an otherwise usted brief.
  const register =
    locale === "es" ? " Address the owner as usted (Confirme, Envíe), never tú." : locale === "zh-Hans" ? " Address the owner as 你." : "";
  const terms =
    locale === DEFAULT_LOCALE
      ? ""
      : `
Use the app's own words for these and never leave them in English: lifetime value = "${term("detail.stats.lifetimeValue")}"; quotes or estimates = "${term("detail.estimates.title")}"; invoices = "${term("detail.invoices.title")}"; a lead = "${term("statuses.lead")}". Mid-sentence they are lowercase, like any other noun.${register}`;

  const systemPrompt =
    `You are an AI business advisor analyzing a client relationship for a small business owner.
Be direct, concise, and actionable. Focus on what matters most right now.
Today's date: ${withWeekday(today)}.
Dates in the context are written out with their weekday; copy them as written. A weekday a note mentions ("el sábado") and a date from a task or an invoice are separate facts: never combine them into one date, and never give a date any weekday but the one written with it.${terms}` + languageDirectiveForJson(locale);

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
    {"label": "${t("detail.stats.lifetimeValue")}", "value": "$X,XXX"},
    {"label": "${t("brief.factLabels.lastContact")}", "value": "X days ago"},
    {"label": "${t("brief.factLabels.openInvoices")}", "value": "X totaling $X"},
    {"label": "${t("form.status")}", "value": "..."}
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
