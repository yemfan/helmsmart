import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { sendEmail } from "@/lib/email";
import { scheduleEmailSequenceForLead } from "@/lib/emailSequences";
import { logEngagementEvent } from "@/lib/contacts/logEngagementEvent";
import { runLeadMarketplacePipeline } from "@/lib/leadScorePipeline";
import {
  CONSENT_SOURCE_HOME_VALUE_FUNNEL,
  HOME_VALUE_FUNNEL_DISCLOSURE_VERSION,
} from "@/lib/consent/disclosureVersions";
import { extractRequestMeta } from "@/lib/consent/extractRequestMeta";
import { recordInboundContactRequest } from "@/lib/consent/service";

/** Returns { userId, agentId } for an authenticated agent, or a 401/403 NextResponse. */
async function getAuthenticatedAgentId(): Promise<
  { userId: string; agentId: string } | NextResponse
> {
  const supabase = supabaseServerClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  const { data: agentRow } = await supabase
    .from("agents")
    .select("id")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (!agentRow?.id) {
    return NextResponse.json({ ok: false, error: "Agent profile not found" }, { status: 403 });
  }
  return { userId: userData.user.id, agentId: String(agentRow.id) };
}

type LeadPayload = {
  name?: string;
  email: string;
  phone?: string;
  address: string;
  agent?: string;
  source?: string;
  traffic_source?: string;
  lead_quality?: string;
  /** TCPA opt-in flag from the home-value funnel form. Required for any
   *  SMS follow-up to fire downstream — see /lib/consent/disclosureVersions. */
  smsConsent?: boolean;
};

function formatUsPhone(input: string) {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as LeadPayload;
    const { name, email, phone, address, agent, source, traffic_source, lead_quality } = body;
    const formattedPhone = phone ? formatUsPhone(phone) : null;
    const smsConsent = Boolean(body.smsConsent);

    if (!email || !address) {
      return NextResponse.json(
        { ok: false, error: "Email and address are required." },
        { status: 400 }
      );
    }

    if (smsConsent && !formattedPhone) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Please add a phone number to receive SMS, or untick the SMS consent checkbox.",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseServer
      .from("contacts")
      .insert({
        agent_id: agent ?? null,
        name: name || address,
        email,
        phone: formattedPhone ?? null,
        // Load-bearing TCPA flag — only flip when the visitor ticked the
        // homepage SMS consent box. The disclosure version they saw is
        // captured in the inbound_contact_requests audit row below.
        sms_opt_in: smsConsent,
        property_address: address,
        source: source || "landing",
        traffic_source: traffic_source ?? source ?? "landing",
        lead_quality: lead_quality ?? null,
        lead_status: "new",
        notes: null,
        rating: "warm",
        contact_frequency: "weekly",
        contact_method: "email",
        next_contact_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("Error inserting lead", error);
      return NextResponse.json(
        { ok: false, error: "Failed to save lead." },
        { status: 500 }
      );
    }

    if (data?.id) {
      // Record proof-of-consent audit row immediately after the lead create.
      // Same audit table as /contact and /open-house-signup use — TCR /
      // carrier audits can grep by `consent_disclosure_version` to retrieve
      // the exact wording the consenting party saw at submit time.
      // Best-effort: a consent-table outage MUST NOT block lead capture.
      try {
        const meta = extractRequestMeta(req);
        await recordInboundContactRequest({
          source: CONSENT_SOURCE_HOME_VALUE_FUNNEL,
          name: name || null,
          email: email || null,
          phone: formattedPhone,
          subject: "Home value funnel",
          message: address,
          smsConsent,
          emailConsent: null,
          consentDisclosureVersion: HOME_VALUE_FUNNEL_DISCLOSURE_VERSION,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          contactId: String(data.id),
        });
      } catch (e) {
        console.error("/api/leads: consent audit write threw", e);
      }

      await scheduleEmailSequenceForLead(data.id as string);
      // Trigger initial scoring on lead creation. logEngagementEvent logs the
      // event AND refreshes the composite rating in one call.
      try {
        await logEngagementEvent(String(data.id), "visit", {
          source: "landing",
          payload: { source: source || "landing" },
        });
        await runLeadMarketplacePipeline(String(data.id));
      } catch {}
    }

    const agentEmail = process.env.AGENT_NOTIFICATION_EMAIL;
    if (agentEmail) {
      await sendEmail({
        to: agentEmail,
        subject: "New LeadSmart AI Lead",
        text: `New lead captured from landing page:

Name: ${name || "(not provided)"}
Email: ${email}
Phone: ${phone || "(not provided)"}
Address: ${address}
Agent param: ${agent || "(not provided)"}
Source: ${source || "landing"}
Timestamp: ${new Date().toISOString()}`,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("POST /api/leads error", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const auth = await getAuthenticatedAgentId();
    if (auth instanceof NextResponse) return auth;
    const { agentId } = auth;

    const { data, error } = await supabaseServer
      .from("contacts")
      .select(
        "id,name,email,phone,sms_opt_in,property_address,source,lead_status,notes,rating,contact_frequency,contact_method,last_contacted_at,next_contact_at,created_at,search_location,search_radius,price_min,price_max,beds,baths"
      )
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("GET /api/leads error", error);
      return NextResponse.json(
        { ok: false, error: "Failed to load leads." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, leads: data ?? [] });
  } catch (e: any) {
    console.error("GET /api/leads error", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await getAuthenticatedAgentId();
    if (auth instanceof NextResponse) return auth;
    const { agentId } = auth;

    const body = (await req.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      // Smart Lead Notifications fields (all optional).
      search_location?: string | null;
      search_radius?: number | string | null;
      price_min?: number | string | null;
      price_max?: number | string | null;
      beds?: number | string | null;
      baths?: number | string | null;
    };

    const id = body.id;
    const status = body.status;

    function toNullableNumber(v: any): number | null {
      if (v === undefined) return undefined as any;
      if (v === null) return null;
      if (typeof v === "string" && !v.trim()) return null;
      const n = typeof v === "string" ? Number(v) : v;
      return Number.isFinite(n) ? n : null;
    }

    const searchLocation =
      body.search_location === undefined ? undefined : (body.search_location ?? null);

    const radius = toNullableNumber(body.search_radius);
    const priceMin = toNullableNumber(body.price_min);
    const priceMax = toNullableNumber(body.price_max);
    const beds = toNullableNumber(body.beds);
    const baths = toNullableNumber(body.baths);

    const hasNotifUpdates =
      searchLocation !== undefined ||
      radius !== undefined ||
      priceMin !== undefined ||
      priceMax !== undefined ||
      beds !== undefined ||
      baths !== undefined;

    if (!id || (!status && !hasNotifUpdates)) {
      return NextResponse.json(
        {
          ok: false,
          error: "id is required. Provide `status` and/or notification filter fields.",
        },
        { status: 400 }
      );
    }

    const updatePayload: any = {};
    if (status) updatePayload.lead_status = status;
    if (searchLocation !== undefined) updatePayload.search_location = searchLocation;
    if (radius !== undefined) updatePayload.search_radius = radius;
    if (priceMin !== undefined) updatePayload.price_min = priceMin;
    if (priceMax !== undefined) updatePayload.price_max = priceMax;
    if (beds !== undefined) updatePayload.beds = beds;
    if (baths !== undefined) updatePayload.baths = baths;

    const { data, error } = await supabaseServer
      .from("contacts")
      .update(updatePayload)
      .eq("id", id)
      .eq("agent_id", agentId)
      .select(
        "id,name,email,phone,property_address,source,lead_status,notes,created_at,search_location,search_radius,price_min,price_max,beds,baths"
      )
      .maybeSingle();

    if (error) {
      console.error("PATCH /api/leads error", error);
      return NextResponse.json(
        { ok: false, error: "Failed to update lead." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, lead: data });
  } catch (e: any) {
    console.error("PATCH /api/leads error", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

