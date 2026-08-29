import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServerClient";

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
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (agentErr) throw agentErr;

    const agentId = String((agent as any)?.id ?? "");

    if (!agentId) {
      return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 404 });
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
      .from("contacts")
      .insert(insert)
      .select("id")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, id: data?.id ?? null });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

