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

    // Fetch all leads for this agent or team roster (bounded)
    const { data: leads } = await supabaseServer
      .from("contacts")
      .select("id, rating, last_contacted_at, created_at")
      .in("agent_id", scope.agentIds)
      .limit(5000);

    const rows = (leads ?? []) as Array<{
      id: string;
      rating: string | null;
      last_contacted_at: string | null;
      created_at: string;
    }>;

    // Rating breakdown
    const ratingCounts: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    for (const r of rows) {
      const rat = String(r.rating ?? "").toLowerCase();
      if (rat === "hot" || rat === "warm" || rat === "cold") ratingCounts[rat]++;
      else ratingCounts["warm"]++; // default unrated to warm
    }

    // Last Contacted breakdown
    const now30 = Date.now() - 30 * 86_400_000;
    const now6m = Date.now() - 180 * 86_400_000;
    const now1y = Date.now() - 365 * 86_400_000;
    const lastContacted = { within30d: 0, within6m: 0, within1y: 0, over1y: 0, never: 0 };
    for (const r of rows) {
      if (!r.last_contacted_at) { lastContacted.never++; continue; }
      const t = new Date(r.last_contacted_at).getTime();
      if (t >= now30) lastContacted.within30d++;
      else if (t >= now6m) lastContacted.within6m++;
      else if (t >= now1y) lastContacted.within1y++;
      else lastContacted.over1y++;
    }

    // Growth by month (last 12 months)
    const monthCounts: Record<string, number> = {};
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthCounts[key] = 0;
    }
    for (const r of rows) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (key in monthCounts) monthCounts[key]++;
    }

    /*
     * `month` only — no `label`. This used to format the label here with a
     * hardcoded "en-US", so a Chinese-speaking agent's growth chart was
     * labelled Jan/Feb/Mar. A month name is display copy, and this route has
     * no idea what language the reader is in; the client formats it with the
     * locale it is already rendering in.
     */
    const growth = Object.entries(monthCounts).map(([month, count]) => ({
      month,
      count,
    }));

    return NextResponse.json({
      ok: true,
      /*
       * `key`, not `name`. These are chart legend labels, and returning them
       * as English words made the contacts page render a `Hot / Warm / Cold`
       * legend next to a table whose own rating pills said 热门 / 一般 / 冷淡 —
       * the same three values, in two languages, six inches apart. The client
       * holds the translations; the API returns what the slice IS.
       */
      rating: [
        { key: "hot", value: ratingCounts.hot, color: "#ef4444" },
        { key: "warm", value: ratingCounts.warm, color: "#f59e0b" },
        { key: "cold", value: ratingCounts.cold, color: "#6b7280" },
      ],
      lastContacted: [
        { key: "within30d", value: lastContacted.within30d, color: "#22c55e" },
        { key: "within6m", value: lastContacted.within6m, color: "#3b82f6" },
        { key: "within1y", value: lastContacted.within1y, color: "#f59e0b" },
        { key: "over1y", value: lastContacted.over1y, color: "#ef4444" },
        { key: "never", value: lastContacted.never, color: "#e5e7eb" },
      ],
      growth,
      total: rows.length,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
  }
}
