import { NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { describeApiError, serializeError } from "@/lib/api/describeApiError";

export async function GET() {
  try {
    const supabase = supabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const [agentRes, profileRes] = await Promise.all([
      supabase
        .from("agents")
        .select(
          "id, brand_name, signature_html, logo_url, agent_photo_url, brokerage, phone, lead_ad_privacy_policy_url",
        )
        .eq("auth_user_id", userData.user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("user_profiles")
        .select("full_name, email, phone")
        .eq("user_id", userData.user.id)
        .maybeSingle(),
    ]);

    const agent = agentRes.data;
    if (!agent) return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 403 });

    const profile = profileRes.data as { full_name?: string; email?: string; phone?: string } | null;

    return NextResponse.json({
      ok: true,
      branding: {
        brandName: (agent as Record<string, unknown>).brand_name ?? "",
        signatureHtml: (agent as Record<string, unknown>).signature_html ?? "",
        logoUrl: (agent as Record<string, unknown>).logo_url ?? "",
        agentPhotoUrl: (agent as Record<string, unknown>).agent_photo_url ?? "",
        // Per-broker override for Meta Lead Ad form's privacy policy
        // URL. Null = use LeadSmart's default.
        leadAdPrivacyPolicyUrl:
          (agent as Record<string, unknown>).lead_ad_privacy_policy_url ?? "",
      },
      profile: {
        fullName: profile?.full_name ?? "",
        email: profile?.email ?? userData.user.email ?? "",
        phone: profile?.phone ?? (agent as any)?.phone ?? "",
        brokerage: (agent as any)?.brokerage ?? "",
      },
    });
  } catch (e: unknown) {
    console.error("GET /api/dashboard/branding:", serializeError(e));
    const { message, status } = describeApiError(e, "Could not load your branding settings.");
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = supabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const { data: agent } = await supabase
      .from("agents")
      .select("id")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();

    if (!agent?.id) return NextResponse.json({ ok: false, error: "Agent not found" }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as {
      brandName?: string;
      signatureHtml?: string;
      logoUrl?: string;
      agentPhotoUrl?: string;
      leadAdPrivacyPolicyUrl?: string;
    };

    const update: Record<string, unknown> = {};
    if (body.brandName !== undefined) update.brand_name = String(body.brandName).slice(0, 200);
    if (body.signatureHtml !== undefined) update.signature_html = String(body.signatureHtml).slice(0, 2000);
    if (body.logoUrl !== undefined) update.logo_url = String(body.logoUrl).slice(0, 500);
    if (body.agentPhotoUrl !== undefined) update.agent_photo_url = String(body.agentPhotoUrl).slice(0, 500);
    if (body.leadAdPrivacyPolicyUrl !== undefined) {
      // Empty string from the UI = clear back to default (null).
      // Lightweight URL sanity check — Meta will reject non-https
      // anyway, surface the issue earlier with a clearer error.
      const raw = String(body.leadAdPrivacyPolicyUrl).trim().slice(0, 500);
      if (raw === "") {
        update.lead_ad_privacy_policy_url = null;
      } else {
        if (!/^https?:\/\//i.test(raw)) {
          return NextResponse.json(
            {
              ok: false,
              error:
                "Privacy policy URL must start with http:// or https://",
            },
            { status: 400 },
          );
        }
        update.lead_ad_privacy_policy_url = raw;
      }
    }

    if (!Object.keys(update).length) {
      return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("agents")
      .update(update)
      .eq("id", agent.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    console.error("PATCH /api/dashboard/branding:", serializeError(e));
    const { message, status } = describeApiError(e, "Could not save your branding settings.");
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
