import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";
import { getUserFromRequest } from "@/lib/authFromRequest";
import type { ToolName } from "@/lib/tokenCosts";
import { TOOL_TOKEN_COST } from "@/lib/tokenCosts";

export type ConsumeResult =
  | { ok: true; userId: string; user: User | null; plan: string; tokensRemaining: number }
  | { ok: false; status: number; error: string; tokensRemaining?: number; plan?: string };

export async function consumeTokensForTool(params: {
  req: Request;
  tool: ToolName;
  requireAuth: boolean;
}): Promise<ConsumeResult> {
  const user = await getUserFromRequest(params.req);
  if (!user) {
    if (params.requireAuth) {
      return { ok: false, status: 401, error: "Not authenticated" };
    }
    // guest allowed: no tokens deducted
    return { ok: true, userId: "guest", user: null, plan: "guest", tokensRemaining: Infinity };
  }

  const cost = TOOL_TOKEN_COST[params.tool];
  const { data, error } = await supabaseServer.rpc("consume_tokens", {
    p_user_id: user.id,
    p_tool_name: params.tool,
    p_tokens_required: cost,
  });

  if (error) {
    return { ok: false, status: 500, error: error.message };
  }

  const ok = Boolean((data as any)?.ok);
  const plan = String((data as any)?.plan ?? "free");
  const tokensRemaining = Number((data as any)?.tokens_remaining ?? 0);
  const message = String((data as any)?.message ?? "");

  if (!ok) {
    const isUpgrade = /upgrade required/i.test(message) || tokensRemaining <= 0;
    return {
      ok: false,
      status: isUpgrade ? 402 : 400,
      error: message || "Not allowed",
      plan,
      tokensRemaining,
    };
  }

  return { ok: true, userId: user.id, user, plan, tokensRemaining };
}

