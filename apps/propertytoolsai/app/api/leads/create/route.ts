import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { runLeadMarketplacePipeline } from "@/lib/leadScorePipeline";

type Body = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  property_address?: string | null;
  source?: string | null;
  notes?: string | null;
};

function formatUsPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseServerClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) throw userErr;
    if (!userData.user) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const userId = userData.user.id;

    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("id,plan_type,auth_user_id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (agentErr) throw agentErr;

    const agentId = String((agent as any)?.id ?? "");
    const planType = String((agent as any)?.plan_type ?? "free").toLowerCase();

    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
    }

    if (planType === "free") {
      return NextResponse.json(
        { ok: false, error: "CRM is not available on Free. Upgrade to Pro to add leads." },
        { status: 402 }
      );
    }

    // Pro lead limit = 500; Premium unlimited.
    if (planType === "pro") {
      const { count } = await supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", agentId);
      if ((count ?? 0) >= 500) {
        return NextResponse.json(
          { ok: false, error: "Upgrade to Premium for unlimited leads." },
          { status: 402 }
        );
      }
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const formattedPhone = body.phone ? formatUsPhone(String(body.phone)) : null;
    const insert = {
      agent_id: agentId,
      name: body.name ?? null,
      email: body.email ?? null,
      phone: formattedPhone ?? null,
      property_address: body.property_address ?? null,
      source: body.source ?? "crm",
      lead_status: "new",
      notes: body.notes ?? null,
      rating: "warm",
      contact_frequency: "weekly",
      contact_method: "email",
      sms_opt_in: false,
      next_contact_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    } as any;

    const { data, error } = await supabase
      .from("leads")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw error;

    if (data?.id != null) {
      try {
        await runLeadMarketplacePipeline(String(data.id));
      } catch (e) {
        console.warn("create lead marketplace pipeline", e);
      }
    }

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

