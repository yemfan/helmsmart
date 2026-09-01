import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

function formatUsPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      leadId?: string | number;
      phone?: string;
      highIntent?: boolean;
    };

    const leadId = String(body.leadId ?? "").trim();
    const phoneRaw = String(body.phone ?? "").trim();
    const highIntent = Boolean(body.highIntent);

    if (!leadId) {
      return NextResponse.json({ ok: false, error: "leadId is required." }, { status: 400 });
    }
    if (!phoneRaw) {
      return NextResponse.json({ ok: false, error: "phone is required." }, { status: 400 });
    }

    const formatted = formatUsPhone(phoneRaw);
    if (!formatted) {
      return NextResponse.json(
        { ok: false, error: "Phone must be a valid US number (10 digits)." },
        { status: 400 }
      );
    }

    const nextStage = highIntent ? "high_intent" : "phone_captured";

    const { data, error } = await supabaseServer
      .from("contacts")
      .update({ phone: formatted, stage: nextStage } as any)
      .eq("id", leadId)
      .select("id,stage")
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ ok: true, leadId, stage: (data as any)?.stage ?? nextStage });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

