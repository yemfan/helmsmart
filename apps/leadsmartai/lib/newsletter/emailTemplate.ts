import {
  CATEGORY_LABEL,
  coerceCategory,
  coerceState,
  type DigestItem,
} from "./generateDigest";
import type { NewsletterIssue } from "./assembleIssue";

/**
 * Email renderer for the Weekly Regional Newsletter issue (Phase 2, public
 * delivery). Pure — no `server-only`, no Resend — so the wording/markup can be
 * unit-tested. The send cron calls renderIssueEmail() then hands the result to
 * sendEmail().
 *
 * Mirrors lib/cma/emailTemplate.ts: all styles INLINE, table layout, ~600px,
 * plain and high-deliverability (no remote images, no spammy styling). The
 * footer carries the CAN-SPAM essentials: an unsubscribe link, a "why you got
 * this" line, and a physical mailing address.
 */

/** A subscription row's shape as far as the email needs it. */
export type IssueEmailSubscription = {
  email: string;
  region_name: string | null;
  region_code: string;
};

export type RenderIssueEmailArgs = {
  issue: NewsletterIssue;
  subscription: IssueEmailSubscription;
  /** Fully-qualified one-click unsubscribe URL (unsubscribe_token baked in). */
  unsubscribeUrl: string;
  /** Physical postal address for the CAN-SPAM footer. */
  mailingAddress: string;
  /** Absolute site origin (getSiteUrl()) for the "read online" + brand links. */
  siteUrl: string;
};

export type RenderedIssueEmail = {
  subject: string;
  text: string;
  html: string;
};

const BRAND_BLUE = "#0072ce";

export function renderIssueEmail(args: RenderIssueEmailArgs): RenderedIssueEmail {
  const { issue, unsubscribeUrl, mailingAddress, siteUrl } = args;
  const { digest, region, weekOf } = issue;

  const weekLabel = formatWeek(weekOf);
  const regionName = region.name;
  const issueUrl = `${siteUrl.replace(/\/$/, "")}/newsletter/${region.slug}/${weekOf}`;

  // Order items the same way the web issue does: national items + items matching
  // this region's own state come first; other-state items last. Nothing dropped.
  const items = orderItems(
    Array.isArray(digest.items) ? digest.items : [],
    region.stateCode,
  );

  const subject = `This Week in Housing — ${regionName} · ${weekLabel}`;

  const text = renderText({
    digest,
    region,
    items,
    weekLabel,
    issueUrl,
    unsubscribeUrl,
    mailingAddress,
  });
  const html = renderHtml({
    digest,
    region,
    items,
    weekLabel,
    issueUrl,
    unsubscribeUrl,
    mailingAddress,
  });

  return { subject, text, html };
}

type NormalizedItem = DigestItem & { scope: "national" | "state" };

function orderItems(raw: DigestItem[], regionState: string | null): NormalizedItem[] {
  return raw
    .map((it) => {
      const state = coerceState((it as Partial<DigestItem>).state);
      return {
        ...it,
        category: coerceCategory((it as Partial<DigestItem>).category),
        state,
        scope: state ? ("state" as const) : ("national" as const),
      };
    })
    .map((it, idx) => {
      const relevant =
        it.scope === "national" || (regionState !== null && it.state === regionState);
      return { it, idx, rank: relevant ? 0 : 1 };
    })
    .sort((a, b) => a.rank - b.rank || a.idx - b.idx)
    .map((x) => x.it);
}

type RenderCtx = {
  digest: NewsletterIssue["digest"];
  region: NewsletterIssue["region"];
  items: NormalizedItem[];
  weekLabel: string;
  issueUrl: string;
  unsubscribeUrl: string;
  mailingAddress: string;
};

function renderText(ctx: RenderCtx): string {
  const { digest, region, items, weekLabel, issueUrl, unsubscribeUrl, mailingAddress } =
    ctx;
  const lines: string[] = [];
  lines.push(`This Week in Housing — ${region.name} · ${weekLabel}`);
  lines.push("");
  if (digest.title) lines.push(digest.title);
  if (digest.intro) {
    lines.push("");
    lines.push(digest.intro);
  }
  lines.push("");
  lines.push("— This week in housing —");
  for (const it of items) {
    lines.push("");
    const cat = CATEGORY_LABEL[it.category];
    lines.push(`[${cat}${it.state ? ` · ${it.state}` : ""}] ${it.headline}`);
    if (it.why_it_matters) lines.push(`What it means for you: ${it.why_it_matters}`);
    if (it.source_url) lines.push(`Read source: ${it.source_url}`);
  }
  if (region.stats.length > 0) {
    lines.push("");
    lines.push(`— ${region.name} market snapshot —`);
    for (const st of region.stats) {
      lines.push(`${st.short}: ${st.formatted}${st.periodLabel ? ` (${st.periodLabel})` : ""}`);
    }
  }
  lines.push("");
  lines.push(`Read the full issue online: ${issueUrl}`);
  lines.push("");
  lines.push("—");
  lines.push(
    "You're receiving this because you subscribed to the RealtyBoss weekly housing briefing at realtybossai.com.",
  );
  lines.push(`Unsubscribe: ${unsubscribeUrl}`);
  lines.push(mailingAddress);
  return lines.join("\n");
}

function renderHtml(ctx: RenderCtx): string {
  const { digest, region, items, weekLabel, issueUrl, unsubscribeUrl, mailingAddress } =
    ctx;

  const itemsHtml = items
    .map((it) => {
      const cat = CATEGORY_LABEL[it.category];
      const badge = `<span style="display:inline-block;background:${BRAND_BLUE};color:#ffffff;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;">${escapeHtml(
        cat,
      )}</span>`;
      const stateBadge = it.state
        ? ` <span style="display:inline-block;background:#e2e8f0;color:#475569;font-size:11px;font-weight:600;padding:2px 8px;border-radius:9999px;">${escapeHtml(
            it.state,
          )}</span>`
        : "";
      const why = it.why_it_matters
        ? `<div style="margin-top:8px;background:#f1f6fc;border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.5;color:#334155;"><strong style="color:${BRAND_BLUE};">What it means for you: </strong>${escapeHtml(
            it.why_it_matters,
          )}</div>`
        : "";
      const summary = it.summary
        ? `<div style="margin-top:6px;font-size:13px;line-height:1.5;color:#475569;">${escapeHtml(
            it.summary,
          )}</div>`
        : "";
      const source = it.source_url
        ? `<div style="margin-top:8px;font-size:12px;"><a href="${escapeAttr(
            it.source_url,
          )}" style="color:${BRAND_BLUE};text-decoration:underline;">Read source →${
            it.publisher ? ` (${escapeHtml(it.publisher)})` : ""
          }</a></div>`
        : "";
      return `<tr><td style="padding:0 0 18px;">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;background:#ffffff;">
          <div style="margin-bottom:6px;">${badge}${stateBadge}</div>
          <div style="font-size:16px;font-weight:700;line-height:1.35;color:#0f172a;">${escapeHtml(
            it.headline,
          )}</div>
          ${summary}
          ${why}
          ${source}
        </div>
      </td></tr>`;
    })
    .join("");

  const statsHtml =
    region.stats.length > 0
      ? `<tr><td style="padding:6px 0 4px;">
          <div style="font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#475569;margin-bottom:8px;">${escapeHtml(
            region.name,
          )} market snapshot</div>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
            ${region.stats
              .map(
                (st) => `<tr>
              <td style="padding:6px 0;font-size:13px;color:#475569;border-bottom:1px solid #f1f5f9;">${escapeHtml(
                st.short,
              )}${st.periodLabel ? ` <span style="color:#94a3b8;">· ${escapeHtml(st.periodLabel)}</span>` : ""}</td>
              <td style="padding:6px 0;font-size:14px;font-weight:700;color:#0f172a;text-align:right;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${escapeHtml(
                st.formatted,
              )}</td>
            </tr>`,
              )
              .join("")}
          </table>
        </td></tr>`
      : "";

  const introHtml = digest.intro
    ? `<tr><td style="padding:0 0 16px;font-size:15px;line-height:1.55;color:#475569;">${escapeHtml(
        digest.intro,
      )}</td></tr>`
    : "";

  // Outer wrapper: centered ~600px table, light background, no remote images.
  return `<!-- RealtyBoss weekly housing briefing -->
<div style="background:#f8fafc;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="width:100%;max-width:600px;margin:0 auto;">
    <tr><td style="padding:0 20px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0 4px;">
          <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND_BLUE};">RealtyBoss</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">This Week in Housing · ${escapeHtml(
            region.name,
          )} · Week of ${escapeHtml(weekLabel)}</div>
        </td></tr>
        <tr><td style="padding:14px 0 8px;">
          <div style="font-size:22px;font-weight:800;line-height:1.25;color:#0f172a;">${escapeHtml(
            digest.title || "This Week in Housing",
          )}</div>
        </td></tr>
        ${introHtml}
        ${itemsHtml}
        ${statsHtml}
        <tr><td style="padding:18px 0 4px;">
          <a href="${escapeAttr(
            issueUrl,
          )}" style="display:inline-block;background:${BRAND_BLUE};color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px;">Read the full issue online →</a>
        </td></tr>
        <tr><td style="padding:24px 0 0;border-top:1px solid #e2e8f0;">
          <div style="font-size:12px;line-height:1.55;color:#94a3b8;padding-top:14px;">
            You're receiving this because you subscribed to the RealtyBoss weekly housing briefing at
            <a href="${escapeAttr(
              args_siteHref(issueUrl),
            )}" style="color:#64748b;">realtybossai.com</a>.<br/>
            <a href="${escapeAttr(
              unsubscribeUrl,
            )}" style="color:#64748b;text-decoration:underline;">Unsubscribe</a> at any time.<br/>
            ${escapeHtml(mailingAddress)}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;
}

/** Origin of the issue URL, for the "subscribed at …" footer link. */
function args_siteHref(issueUrl: string): string {
  try {
    return new URL(issueUrl).origin;
  } catch {
    return "https://www.realtybossai.com";
  }
}

function formatWeek(d: string): string {
  const dt = new Date(`${d}T00:00:00Z`);
  return Number.isNaN(dt.getTime())
    ? d
    : dt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Attribute-context escape (for href values). */
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
