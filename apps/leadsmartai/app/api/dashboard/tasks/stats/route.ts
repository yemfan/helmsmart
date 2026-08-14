import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { supabaseServer } from "@/lib/supabaseServer";
import { getAgentScopeForAgent } from "@/lib/teams/scope.server";

export async function GET() {
  try {
    const supabase = supabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: agent } = await supabase.from("agents").select("id").eq("auth_user_id", userData.user.id).maybeSingle();
    if (!agent?.id) return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 403 });

    const scope = await getAgentScopeForAgent(String(agent.id));
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

    /**
     * The Tasks page renders a unified list across BOTH backends —
     * crm_tasks (manual + briefing) AND playbook_task_instances
     * (per-anchor batches + coaching). Stats here have to mirror that
     * union, otherwise an agent who only has playbook tasks (the
     * common case for new accounts that applied a playbook before
     * creating any manual tasks) sees the chart sitting at 0 / 0 / 0
     * even with active work on the page below it. Both fetched in
     * parallel; same 30-day window, same agent scope.
     */
    const [crmRes, pbRes] = await Promise.all([
      supabaseServer
        .from("crm_tasks")
        .select("id, status, due_at, completed_at, created_at")
        .in("agent_id", scope.agentIds)
        .gte("created_at", thirtyDaysAgo)
        .limit(2000),
      supabaseServer
        .from("playbook_task_instances")
        .select("id, due_date, completed_at, cancelled_at, created_at")
        .in("agent_id", scope.agentIds)
        .gte("created_at", thirtyDaysAgo)
        .limit(2000),
    ]);

    type NormalizedTask = {
      status: "done" | "open" | "cancelled";
      due_at: string | null;
      completed_at: string | null;
    };
    const tasks: NormalizedTask[] = [];
    for (const t of (crmRes.data ?? []) as Array<{
      status: string;
      due_at: string | null;
      completed_at: string | null;
    }>) {
      tasks.push({
        status: (t.status === "done" || t.status === "cancelled" ? t.status : "open"),
        due_at: t.due_at,
        completed_at: t.completed_at,
      });
    }
    // Playbook rows store status implicitly via completed_at +
    // cancelled_at columns (the tasks page derives the same way).
    // due_date is YYYY-MM-DD; synthesize an end-of-day ISO so the
    // overdue comparison below has the same shape as crm_tasks.due_at.
    for (const t of (pbRes.data ?? []) as Array<{
      due_date: string | null;
      completed_at: string | null;
      cancelled_at: string | null;
    }>) {
      const status: NormalizedTask["status"] = t.completed_at
        ? "done"
        : t.cancelled_at
          ? "cancelled"
          : "open";
      tasks.push({
        status,
        due_at: t.due_date ? `${t.due_date}T23:59:59.999Z` : null,
        completed_at: t.completed_at,
      });
    }

    const now = Date.now();
    let doneOnTime = 0;
    let doneLate = 0;
    let overdue = 0;
    let pending = 0;
    let cancelled = 0;

    // Why five buckets, not three: the previous "On time / Deferred /
    // Unfinished" labels conflated two distinct things the agent cares
    // about. Specifically, "Deferred" included BOTH (a) tasks that
    // were done but completed past the due date AND (b) open tasks
    // that are now overdue — visually identical in the chart, but
    // very different mental states ("I did the work late" vs "I still
    // owe this work"). Same problem on the other side: "Unfinished"
    // mixed cancelled tasks with not-yet-due open tasks.
    //
    // Bucket choices match the Open / Done / Cancelled tab labels so
    // an agent can mentally line up the pie with the tab numbers.
    // Done-late stays in a green-family color so the eye reads done
    // as done — the previous orange/Deferred slice made completed
    // work look like missed work.

    for (const t of tasks) {
      if (t.status === "done") {
        if (
          !t.due_at ||
          !t.completed_at ||
          new Date(t.completed_at).getTime() <= new Date(t.due_at).getTime()
        ) {
          doneOnTime++;
        } else {
          doneLate++;
        }
      } else if (t.status === "open") {
        if (t.due_at && new Date(t.due_at).getTime() < now) {
          overdue++;
        } else {
          pending++;
        }
      } else {
        cancelled++;
      }
    }

    // Total performed in 30 days
    const performed = tasks.filter((t) => t.status === "done").length;

    // Tasks completed per day (last 30 days)
    const dailyCounts: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const key = d.toISOString().slice(0, 10);
      dailyCounts[key] = 0;
    }
    for (const t of tasks) {
      if (t.status === "done" && t.completed_at) {
        const key = new Date(t.completed_at).toISOString().slice(0, 10);
        if (key in dailyCounts) dailyCounts[key]++;
      }
    }
    const performedByDay = Object.entries(dailyCounts).map(([date, count]) => ({
      date,
      label: new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count,
    }));

    // Two-level shape so the UI can render a top-level pie that
    // matches the Done / Open / Cancelled tab counts on the page,
    // and let the agent click any slice to drill into its breakdown.
    //
    //   Done       → On time   /  Late
    //   Open       → Overdue   /  Pending
    //   Cancelled  → (no further breakdown)
    //
    // Zero-value rows are filtered at each level so a healthy account
    // doesn't see "Cancelled 0" in the legend, and a Done-only agent
    // doesn't see an empty "Late 0" slice in the drill-down.

    const completion = [
      {
        key: "done",
        name: "Done",
        value: doneOnTime + doneLate,
        color: "#16a34a", // green-600
        breakdown: [
          { key: "onTime", name: "On time", value: doneOnTime, color: "#16a34a" }, // green-600
          { key: "late", name: "Late", value: doneLate, color: "#84cc16" }, // lime-500
        ].filter((s) => s.value > 0),
      },
      {
        key: "open",
        name: "Open",
        value: overdue + pending,
        color: "#3b82f6", // blue-500
        breakdown: [
          { key: "overdue", name: "Overdue", value: overdue, color: "#f97316" }, // orange-500
          { key: "pending", name: "Pending", value: pending, color: "#94a3b8" }, // slate-400
        ].filter((s) => s.value > 0),
      },
      {
        key: "cancelled",
        name: "Cancelled",
        value: cancelled,
        color: "#e5e7eb", // gray-200
        // No breakdown — terminal slice. Omitting the field lets the
        // UI know not to render a click affordance.
      },
    ].filter((s) => s.value > 0);

    return NextResponse.json({
      ok: true,
      completion,
      performedByDay,
      performed,
      total: tasks.length,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
