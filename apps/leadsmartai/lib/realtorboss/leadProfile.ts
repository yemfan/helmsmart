/**
 * Shared shapes + composition for the person-first lead experience
 * (constitution: leads are people, not records). Consumed by the
 * LeadProfileDrawer (quick read over the command center) and the full
 * /dashboard/leads/[id] profile page — both fed by
 * /api/dashboard/realtorboss/lead/[id].
 */

export type LeadPerson = {
  id: string;
  name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  rating: string | null;
  engagement_score: number | null;
  intent: string | null;
  buying_or_selling: string | null;
  timeline: string | null;
  search_location: string | null;
  price_min: number | null;
  price_max: number | null;
  property_address: string | null;
  notes: string | null;
  created_at: string;
  auto_pilot: boolean;
};

export type LeadNextBestAction = {
  id: string;
  title: string;
  reason: string | null;
  recommended_action: string | null;
  action_href: string | null;
  expected_outcome: string | null;
};

export type LeadProfilePayload = {
  person: LeadPerson;
  tasks: { id: string; title: string; due_at: string | null; priority: string | null }[];
  appointments: { id: string; title: string; starts_at: string }[];
  calls: { id: string; direction: string; status: string; notes: string | null; created_at: string }[];
  messages: { id: string; direction: string; message: string; created_at: string; assistant_type?: string | null }[];
  activities: { id: string; assistant_type: string; summary: string; outcome: string | null; created_at: string }[];
  nextBestAction: LeadNextBestAction | null;
};

export type LeadTimelineItem = {
  id: string;
  at: string;
  icon: string;
  title: string;
  detail: string | null;
};

export const ASSISTANT_LABELS: Record<string, string> = {
  receptionist: "AI Receptionist",
  sales_assistant: "AI Sales Assistant",
  transaction_assistant: "AI Transaction Assistant",
  accountant: "AI Accountant",
  boss_assistant: "Boss Assistant",
};

export function fmtAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function fmtMoney(n: number): string {
  return n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : `$${Math.round(n / 1000)}k`;
}

/** One-line who-they-are summary from structured profile fields. */
export function buildStory(p: LeadPerson): string {
  return [
    p.buying_or_selling ? (p.buying_or_selling === "selling" ? "Seller" : "Buyer") : null,
    p.timeline ? `timeline ${p.timeline}` : null,
    p.search_location ? `looking in ${p.search_location}` : null,
    p.price_min != null && p.price_max != null ? `${fmtMoney(p.price_min)}–${fmtMoney(p.price_max)}` : null,
    p.property_address ? `re: ${p.property_address}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Merge every interaction into one newest-first relationship timeline. */
export function buildTimeline(data: LeadProfilePayload, max: number): LeadTimelineItem[] {
  const items: LeadTimelineItem[] = [
    ...data.activities.map((a) => ({
      id: `act-${a.id}`,
      at: a.created_at,
      icon: "⚡",
      title: `${ASSISTANT_LABELS[a.assistant_type] ?? a.assistant_type}: ${a.summary}`,
      detail: a.outcome,
    })),
    ...data.calls.map((c) => ({
      id: `call-${c.id}`,
      at: c.created_at,
      icon: "📞",
      title: `${c.direction === "inbound" ? "Inbound" : "Outbound"} call · ${c.status}`,
      detail: c.notes?.replace(/^AI call summary:\s*/i, "") ?? null,
    })),
    ...data.messages.map((m) => ({
      id: `sms-${m.id}`,
      at: m.created_at,
      icon: "💬",
      title:
        m.direction === "inbound"
          ? "They texted"
          : m.assistant_type
            ? `${ASSISTANT_LABELS[m.assistant_type] ?? "AI assistant"} texted`
            : "AI assistant texted",
      detail: m.message,
    })),
    ...data.appointments.map((e) => ({
      id: `evt-${e.id}`,
      at: e.starts_at,
      icon: "📅",
      title: e.title,
      detail: new Date(e.starts_at).toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    })),
  ];
  return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, max);
}
