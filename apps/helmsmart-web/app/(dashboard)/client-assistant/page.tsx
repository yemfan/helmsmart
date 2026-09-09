import { PageTitle } from "@/components/page-title";
import { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { OutboundCalls } from "@/components/outbound-calls";
import { AppointmentReminders } from "@/components/appointment-reminders";
import { ResponsibleEmployee } from "@/components/responsible-employee";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("voice");
  return { title: t("meta.clientAssistant") };
}

/**
 * AI Client Assistant — the OUTBOUND half of the front desk: the AI calls your
 * contacts on your behalf (follow-ups, reminders, surveys, announcements). Split out
 * from the old Voice Agent page so inbound (AI Receptionist) and outbound stay distinct.
 */
export default async function ClientAssistantPage() {
  const t = await getServerT("voice");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const nowISO = new Date().toISOString();
  const [{ data: org }, { data: followUpRaw }, { data: apptRaw }] = await Promise.all([
    supabase
      .from("organizations")
      .select("twilio_number, voice_reminder_enabled, voice_reminder_lead_minutes")
      .eq("id", orgId)
      .single(),
    supabase
      .from("clients")
      .select("id, first_name, last_name, company, phone, pipeline_stage")
      .eq("organization_id", orgId)
      .not("phone", "is", null)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("events")
      .select("id, start_at, clients!inner(id, first_name, last_name, phone)")
      .eq("organization_id", orgId)
      .eq("type", "appointment")
      .gt("start_at", nowISO)
      .order("start_at", { ascending: true })
      .limit(50),
  ]);

  const followUp = (followUpRaw ?? []).map((c) => ({
    id: c.id as string,
    name: `${c.first_name}${c.last_name ? ` ${c.last_name}` : ""}`.trim(),
    phone: (c.phone as string | null) ?? null,
    company: (c.company as string | null) ?? null,
    stage: (c.pipeline_stage as string) ?? "lead",
  }));

  type ApptRow = { id: string; start_at: string; clients: { id: string; first_name: string; last_name: string | null; phone: string | null } | null };
  const appointments = ((apptRaw ?? []) as unknown as ApptRow[])
    .filter((e) => e.clients?.phone)
    .map((e) => ({
      clientId: e.clients!.id,
      name: `${e.clients!.first_name}${e.clients!.last_name ? ` ${e.clients!.last_name}` : ""}`.trim(),
      phone: e.clients!.phone,
      startAt: e.start_at,
    }));

  // Automatic appointment reminders: upcoming appointments + each one's reminder status.
  const leadMinutes = (org?.voice_reminder_lead_minutes as number) || 1440;
  const apptIds = ((apptRaw ?? []) as unknown as ApptRow[]).map((e) => e.id);
  const { data: reminderRows } = apptIds.length
    ? await supabase
        .from("outbound_call_queue")
        .select("event_id, status")
        .eq("purpose", "appointment_reminder")
        .in("event_id", apptIds)
    : { data: [] as { event_id: string; status: string }[] };
  const reminderStatus = new Map((reminderRows ?? []).map((r) => [r.event_id as string, r.status as string]));
  const reminders = ((apptRaw ?? []) as unknown as ApptRow[])
    .filter((e) => e.clients?.phone)
    .map((e) => ({
      key: e.id,
      name: `${e.clients!.first_name}${e.clients!.last_name ? ` ${e.clients!.last_name}` : ""}`.trim(),
      phone: e.clients!.phone,
      startAt: e.start_at,
      reminderAt: new Date(new Date(e.start_at).getTime() - leadMinutes * 60_000).toISOString(),
      status: reminderStatus.get(e.id) ?? "pending",
    }));

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <ResponsibleEmployee slug="sarah" className="mb-3" />
        <PageTitle base="AI Client Assistant" />
        <p className="text-sm text-slate-500 mt-0.5">
          {t("clientAssistant.subtitle")}
        </p>
      </div>

      <div className="mb-8">
        <OutboundCalls followUp={followUp} appointments={appointments} hasNumber={Boolean(org?.twilio_number)} />
      </div>

      <div className="mb-8">
        <AppointmentReminders
          enabled={org?.voice_reminder_enabled ?? false}
          leadMinutes={leadMinutes}
          reminders={reminders}
          hasNumber={Boolean(org?.twilio_number)}
        />
      </div>
    </div>
  );
}
