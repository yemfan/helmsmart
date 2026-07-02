import "server-only";

import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { createTask } from "@/lib/crm/pipeline/tasks";
import { defineTool } from "../types";

export const createCrmTask = defineTool({
  name: "create_task",
  description:
    "Create a CRM task for the realtor (optionally tied to a contact), with a priority and optional due time. Use for anything the realtor must do themselves.",
  inputSchema: z.object({
    title: z.string().min(3).max(200),
    description: z.string().max(2000).optional(),
    contact_id: z.string().uuid().optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    due_at: z.string().datetime({ offset: true }).optional().describe("ISO timestamp"),
  }),
  riskClass: "crm_write",
  assignee: "sales_assistant",
  execute: async (ctx, input) => {
    const task = await createTask({
      agentId: ctx.agentId,
      leadId: input.contact_id ?? null,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      dueAt: input.due_at ?? null,
      source: "automation",
    });
    return {
      status: "completed",
      summary: `Task created: ${input.title}`,
      data: { task_id: task.id },
    };
  },
});

export const createCalendarEvent = defineTool({
  name: "create_calendar_event",
  description:
    "Create a calendar event (showing, appointment, open house block) for the agent, optionally tied to a contact. Syncs to Google Calendar when the agent has it connected.",
  inputSchema: z.object({
    title: z.string().min(3).max(200),
    description: z.string().max(2000).optional(),
    starts_at: z.string().datetime({ offset: true }).describe("ISO start time"),
    ends_at: z.string().datetime({ offset: true }).optional().describe("ISO end time"),
    contact_id: z.string().uuid().optional(),
  }),
  riskClass: "crm_write",
  assignee: "receptionist",
  execute: async (ctx, input) => {
    if (input.contact_id) {
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("id")
        .eq("id", input.contact_id)
        .eq("agent_id", ctx.agentId)
        .maybeSingle();
      if (!contact) return { status: "failed", error: "Contact not found for this agent." };
    }
    const { data, error } = await supabaseAdmin
      .from("lead_calendar_events")
      .insert({
        agent_id: ctx.agentId,
        contact_id: input.contact_id ?? null,
        title: input.title,
        description: input.description ?? null,
        starts_at: input.starts_at,
        ends_at: input.ends_at ?? null,
        status: "scheduled",
        metadata_json: { source: "boss_tool", run_id: ctx.runId },
      })
      .select("id")
      .single();
    if (error || !data) {
      return { status: "failed", error: error?.message ?? "Couldn't create the event." };
    }
    return {
      status: "completed",
      summary: `Calendar event created: ${input.title} at ${input.starts_at}`,
      data: { event_id: (data as { id: string }).id },
    };
  },
});

/**
 * query_crm — read-only, WHITELISTED queries. The model picks a named query;
 * it can never run raw SQL (HANDOFF_BOSS_V2 PR-2).
 */
export const queryCrm = defineTool({
  name: "query_crm",
  description:
    "Read-only CRM lookups. Queries: pipeline_summary (contact counts by stage), hot_leads (hottest contacts), stale_hot_leads (hot leads gone quiet), overdue_tasks, upcoming_deadlines (transaction dates in the next 30 days), find_contact (lookup by name).",
  inputSchema: z.object({
    query: z.enum([
      "pipeline_summary",
      "hot_leads",
      "stale_hot_leads",
      "overdue_tasks",
      "upcoming_deadlines",
      "find_contact",
    ]),
    name: z.string().optional().describe("find_contact only: the name to look up"),
  }),
  riskClass: "research",
  assignee: "sales_assistant",
  execute: async (ctx, input) => {
    const agentId = ctx.agentId;
    switch (input.query) {
      case "pipeline_summary": {
        const { data } = await supabaseAdmin
          .from("contacts")
          .select("lifecycle_stage, rating")
          .eq("agent_id", agentId);
        const rows = (data ?? []) as { lifecycle_stage: string | null; rating: string | null }[];
        const byStage: Record<string, number> = {};
        const byRating: Record<string, number> = {};
        for (const r of rows) {
          const s = r.lifecycle_stage ?? "unknown";
          byStage[s] = (byStage[s] ?? 0) + 1;
          const rat = r.rating ?? "unrated";
          byRating[rat] = (byRating[rat] ?? 0) + 1;
        }
        return {
          status: "completed",
          summary: `Pipeline: ${rows.length} contacts across ${Object.keys(byStage).length} stages.`,
          data: { total: rows.length, by_stage: byStage, by_rating: byRating },
        };
      }
      case "hot_leads":
      case "stale_hot_leads": {
        const stale = input.query === "stale_hot_leads";
        let q = supabaseAdmin
          .from("contacts")
          .select("id, name, phone_number, email, lifecycle_stage, last_contacted_at, updated_at")
          .eq("agent_id", agentId)
          .eq("rating", "hot")
          .limit(20);
        if (stale) {
          const cutoff = new Date((ctx.now ?? new Date()).getTime() - 7 * 86_400_000).toISOString();
          q = q.or(`last_contacted_at.lt.${cutoff},last_contacted_at.is.null`).order("last_contacted_at", {
            ascending: true,
            nullsFirst: true,
          });
        } else {
          q = q.order("updated_at", { ascending: false });
        }
        const { data } = await q;
        const rows = data ?? [];
        return {
          status: "completed",
          summary: `${rows.length} ${stale ? "stale " : ""}hot lead${rows.length === 1 ? "" : "s"}.`,
          data: { leads: rows },
        };
      }
      case "overdue_tasks": {
        const nowIso = (ctx.now ?? new Date()).toISOString();
        const { data } = await supabaseAdmin
          .from("crm_tasks")
          .select("id, title, due_at, priority, contact_id")
          .eq("agent_id", agentId)
          .eq("status", "open")
          .lt("due_at", nowIso)
          .order("due_at", { ascending: true })
          .limit(25);
        const rows = data ?? [];
        return {
          status: "completed",
          summary: `${rows.length} overdue task${rows.length === 1 ? "" : "s"}.`,
          data: { tasks: rows },
        };
      }
      case "upcoming_deadlines": {
        const now = ctx.now ?? new Date();
        const in30 = new Date(now.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
        const today = now.toISOString().slice(0, 10);
        const { data } = await supabaseAdmin
          .from("transactions")
          .select(
            "id, property_address, status, closing_date, inspection_deadline, appraisal_deadline, loan_contingency_deadline, contact_id",
          )
          .eq("agent_id", agentId)
          .not("status", "in", "(closed,terminated)")
          .gte("closing_date", today)
          .lte("closing_date", in30)
          .order("closing_date", { ascending: true })
          .limit(25);
        const rows = data ?? [];
        return {
          status: "completed",
          summary: `${rows.length} transaction${rows.length === 1 ? "" : "s"} closing in the next 30 days.`,
          data: { transactions: rows },
        };
      }
      case "find_contact": {
        const name = (input.name ?? "").trim();
        if (name.length < 2) {
          return { status: "failed", error: "find_contact needs a name of 2+ characters." };
        }
        const { data } = await supabaseAdmin
          .from("contacts")
          .select("id, name, phone_number, email, lifecycle_stage, rating, notes")
          .eq("agent_id", agentId)
          .ilike("name", `%${name}%`)
          .limit(5);
        const rows = data ?? [];
        return {
          status: "completed",
          summary: `${rows.length} contact${rows.length === 1 ? "" : "s"} matching "${name}".`,
          data: { contacts: rows },
        };
      }
    }
  },
});
