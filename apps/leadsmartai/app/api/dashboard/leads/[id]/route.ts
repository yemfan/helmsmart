import { NextResponse } from "next/server";
import type {
  ContactFrequency,
  ContactMethod,
  LeadRating,
  LeadStatus,
} from "@leadsmart/shared";
import {
  updateLeadNotes,
  updateLeadStatus,
  updateLeadFollowUpSettings,
  getCurrentAgentContext,
} from "@/lib/dashboardService";
import { updateLeadPipelineStage } from "@/lib/crm/pipeline/leadStage";
import { isSupportedLocale } from "@/lib/locales/registry";
import { supabaseServer } from "@/lib/supabaseServer";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      lead_status?: LeadStatus;
      notes?: string;
      rating?: LeadRating;
      contact_frequency?: ContactFrequency;
      contact_method?: ContactMethod;
      pipeline_stage_id?: string | null;
      last_contacted_at?: string;
      name?: string;
      email?: string;
      phone?: string;
      property_address?: string;
      /**
       * BCP-47 base id (e.g. "zh"), empty string to clear, or undefined to
       * leave unchanged. Validated against the locale registry so unknown
       * ids are 400'd rather than silently coerced.
       */
      preferred_language?: string | null;
    };

    if (body.lead_status) {
      await updateLeadStatus(id, body.lead_status);
    }
    if (typeof body.notes === "string") {
      await updateLeadNotes(id, body.notes);
    }
    if (body.rating || body.contact_frequency || body.contact_method) {
      await updateLeadFollowUpSettings(id, {
        rating: body.rating,
        contact_frequency: body.contact_frequency,
        contact_method: body.contact_method,
      });
    }
    if ("pipeline_stage_id" in body) {
      const { agentId } = await getCurrentAgentContext();
      await updateLeadPipelineStage({
        agentId,
        leadId: id,
        pipelineStageId:
          body.pipeline_stage_id === "" ? null : (body.pipeline_stage_id ?? null),
      });
    }

    // Direct field updates (name, email, phone, address, last_contacted_at,
    // preferred_language).
    const directPatch: Record<string, unknown> = {};
    if (typeof body.name === "string") directPatch.name = body.name;
    if (typeof body.email === "string") directPatch.email = body.email;
    if (typeof body.phone === "string") directPatch.phone = body.phone;
    if (typeof body.property_address === "string") directPatch.property_address = body.property_address;
    if (body.last_contacted_at) directPatch.last_contacted_at = body.last_contacted_at;
    if ("preferred_language" in body) {
      // "" / null / undefined → clear. Anything else must be a known locale.
      if (body.preferred_language == null || body.preferred_language === "") {
        directPatch.preferred_language = null;
      } else if (isSupportedLocale(body.preferred_language)) {
        directPatch.preferred_language = body.preferred_language;
      } else {
        return NextResponse.json(
          { error: `Unknown preferred_language: ${body.preferred_language}` },
          { status: 400 },
        );
      }
    }
    if (Object.keys(directPatch).length > 0) {
      // Scope to the caller's agent so one agent can't edit another's contact
      // by guessing its UUID (supabaseServer is service-role and bypasses RLS).
      const { agentId } = await getCurrentAgentContext();
      await supabaseServer
        .from("contacts")
        .update(directPatch)
        .eq("id", id)
        .eq("agent_id", agentId);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("dashboard lead update error", e);
    return NextResponse.json(
      { error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

