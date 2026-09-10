import type { OpenHouseRow, OpenHouseVisitorRow, VisitorBuyerStatus, VisitorTimeline } from "./types";

/**
 * The open-house wrap-up — the pure half.
 *
 * The sign-in sheet becomes the day's report: how many came, how many had
 * their own agent, who is buying now versus later, what people wrote. Two
 * readers get two versions. The owner reads interest without anyone's
 * contact details (visitors signed in with the host, not with them); the
 * agent who asked for the open house gets the sheet, since it is theirs
 * to follow up. The host's comment goes on both. No I/O here.
 */

export type WrapupVisitor = {
  name: string;
  email: string | null;
  phone: string | null;
  timeline: VisitorTimeline | null;
  buyerStatus: VisitorBuyerStatus | null;
  represented: boolean;
  agentName: string | null;
  agentBrokerage: string | null;
  consent: boolean;
  note: string | null;
  signedInAt: string;
};

export type WrapupSummary = {
  generatedAt: string;
  total: number;
  represented: number;
  unrepresented: number;
  optedIn: number;
  /** Visitors buying now or within six months. */
  hot: number;
  byTimeline: Record<VisitorTimeline | "unknown", number>;
  byStatus: Record<VisitorBuyerStatus | "unknown", number>;
  visitors: WrapupVisitor[];
};

export const TIMELINE_ORDER: (VisitorTimeline | "unknown")[] = ["now", "3_6_months", "6_12_months", "later", "just_looking", "unknown"];
export const STATUS_ORDER: (VisitorBuyerStatus | "unknown")[] = ["looking", "just_browsing", "neighbor", "other", "unknown"];

export const TIMELINE_LABEL: Record<VisitorTimeline | "unknown", string> = {
  now: "Buying now",
  "3_6_months": "3–6 months",
  "6_12_months": "6–12 months",
  later: "Later",
  just_looking: "Just looking",
  unknown: "Not said",
};

export const STATUS_LABEL: Record<VisitorBuyerStatus | "unknown", string> = {
  looking: "Actively looking",
  just_browsing: "Browsing",
  neighbor: "Neighbour",
  other: "Other",
  unknown: "Not said",
};

export function buildWrapupSummary(visitors: readonly OpenHouseVisitorRow[], now = new Date()): WrapupSummary {
  const byTimeline = Object.fromEntries(TIMELINE_ORDER.map((k) => [k, 0])) as WrapupSummary["byTimeline"];
  const byStatus = Object.fromEntries(STATUS_ORDER.map((k) => [k, 0])) as WrapupSummary["byStatus"];
  const list: WrapupVisitor[] = [...visitors]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((v) => ({
      name: v.name?.trim() || v.email?.trim() || v.phone?.trim() || "Visitor",
      email: v.email?.trim() || null,
      phone: v.phone?.trim() || null,
      timeline: v.timeline,
      buyerStatus: v.buyer_status,
      represented: Boolean(v.is_buyer_agented),
      agentName: v.buyer_agent_name?.trim() || null,
      agentBrokerage: v.buyer_agent_brokerage?.trim() || null,
      consent: Boolean(v.marketing_consent),
      note: v.notes?.trim() || null,
      signedInAt: v.created_at,
    }));
  for (const v of list) {
    byTimeline[v.timeline ?? "unknown"] += 1;
    byStatus[v.buyerStatus ?? "unknown"] += 1;
  }
  return {
    generatedAt: now.toISOString(),
    total: list.length,
    represented: list.filter((v) => v.represented).length,
    unrepresented: list.filter((v) => !v.represented).length,
    optedIn: list.filter((v) => v.consent).length,
    hot: byTimeline.now + byTimeline["3_6_months"],
    byTimeline,
    byStatus,
    visitors: list,
  };
}

/** Ended, not cancelled, not yet summarised: the cron's pick. */
export function wrapupDue(oh: Pick<OpenHouseRow, "end_at" | "status"> & { summary_ready_at?: string | null }, nowMs = Date.now()): boolean {
  if (oh.status === "cancelled") return false;
  if (oh.summary_ready_at) return false;
  const end = Date.parse(oh.end_at);
  return Number.isFinite(end) && end <= nowMs;
}

export type WrapupAudience = "owner" | "agent";

export type WrapupRecipient = { audience: WrapupAudience; name: string | null; email: string };

/** Who the wrap-up can go to, from what is on the open house. */
export function wrapupRecipients(oh: { owner_name?: string | null; owner_email?: string | null; requesting_agent_name?: string | null; requesting_agent_email?: string | null }, to: readonly WrapupAudience[]): WrapupRecipient[] {
  const out: WrapupRecipient[] = [];
  if (to.includes("owner") && oh.owner_email?.trim()) out.push({ audience: "owner", name: oh.owner_name?.trim() || null, email: oh.owner_email.trim() });
  if (to.includes("agent") && oh.requesting_agent_email?.trim()) out.push({ audience: "agent", name: oh.requesting_agent_name?.trim() || null, email: oh.requesting_agent_email.trim() });
  return out;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type WrapupEmailInput = {
  openHouse: Pick<OpenHouseRow, "property_address" | "city" | "state" | "start_at" | "end_at" | "list_price">;
  summary: WrapupSummary;
  hostComment: string | null;
  host: { name: string | null; email: string | null; phone: string | null; brokerage: string | null };
  audience: WrapupAudience;
  recipientName: string | null;
  /** For the date line; defaults to the host's zone. */
  timeZone?: string;
  locale?: string;
};

/**
 * The report as it reads in the inbox. The owner's version names nobody's
 * email or phone; the agent's version carries the sheet.
 */
export function renderWrapupEmail(input: WrapupEmailInput): { subject: string; text: string; html: string } {
  const { openHouse: oh, summary: s, audience } = input;
  const tz = input.timeZone ?? "America/Los_Angeles";
  const locale = input.locale ?? "en-US";
  const day = new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: tz }).format(new Date(oh.start_at));
  const time = (iso: string) => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(iso));
  const where = [oh.property_address, oh.city].filter(Boolean).join(", ");
  const subject = `Open house wrap-up: ${where} · ${day}`;
  const hi = input.recipientName ? `Hi ${input.recipientName.split(/\s+/)[0]},` : "Hi,";
  const hostName = input.host.name ?? "your agent";

  const headline =
    s.total === 0
      ? `No one signed in at today's open house at ${where} (${day}, ${time(oh.start_at)}–${time(oh.end_at)}).`
      : `${s.total} ${s.total === 1 ? "visitor" : "visitors"} signed in at the open house at ${where} on ${day}, ${time(oh.start_at)}–${time(oh.end_at)}.`;
  const breakdown: string[] = [];
  if (s.total > 0) {
    breakdown.push(`${s.unrepresented} without an agent · ${s.represented} with their own agent`);
    const tl = TIMELINE_ORDER.filter((k) => s.byTimeline[k] > 0).map((k) => `${TIMELINE_LABEL[k]}: ${s.byTimeline[k]}`);
    if (tl.length) breakdown.push(`Timeline — ${tl.join(", ")}`);
    if (s.hot > 0) breakdown.push(`${s.hot} ${s.hot === 1 ? "is" : "are"} buying within six months`);
  }

  const visitorLines = s.visitors.map((v) => {
    const bits = [v.name];
    if (v.timeline) bits.push(TIMELINE_LABEL[v.timeline]);
    if (v.represented) bits.push(`with ${[v.agentName, v.agentBrokerage].filter(Boolean).join(", ") || "their own agent"}`);
    if (audience === "agent") {
      const reach = [v.email, v.phone].filter(Boolean).join(" · ");
      if (reach) bits.push(reach);
    }
    if (v.note) bits.push(`“${v.note}”`);
    return bits.join(" — ");
  });

  const text = [
    hi,
    "",
    headline,
    ...(breakdown.length ? ["", ...breakdown] : []),
    ...(input.hostComment ? ["", `From ${hostName}:`, input.hostComment] : []),
    ...(visitorLines.length ? ["", audience === "agent" ? "Sign-in sheet:" : "Who came:", ...visitorLines.map((l) => `• ${l}`)] : []),
    "",
    [hostName, input.host.brokerage, input.host.phone, input.host.email].filter(Boolean).join(" · "),
  ].join("\n");

  const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <p style="color:#0f172a;font-size:15px;margin:0 0 12px 0;">${esc(hi)}</p>
    <p style="color:#0f172a;font-size:16px;font-weight:600;line-height:1.5;margin:0 0 12px 0;">${esc(headline)}</p>
    ${breakdown.map((b) => `<p style="color:#334155;font-size:14px;line-height:1.6;margin:0 0 6px 0;">${esc(b)}</p>`).join("")}
    ${input.hostComment ? `<div style="margin:16px 0;padding:12px 14px;background:#eef3fa;border-left:3px solid #0072ce;color:#0f172a;font-size:14px;line-height:1.6;white-space:pre-wrap;"><strong>From ${esc(hostName)}:</strong><br>${esc(input.hostComment)}</div>` : ""}
    ${visitorLines.length ? `<p style="color:#0f172a;font-size:14px;font-weight:600;margin:16px 0 6px 0;">${audience === "agent" ? "Sign-in sheet" : "Who came"}</p><ul style="color:#334155;font-size:14px;line-height:1.6;padding-left:18px;margin:0;">${visitorLines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
    <p style="color:#64748b;font-size:13px;margin:20px 0 0 0;">${esc([hostName, input.host.brokerage, input.host.phone, input.host.email].filter(Boolean).join(" · "))}</p>
  </div>
</body></html>`;
  return { subject, text, html };
}
