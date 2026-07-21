import { NextResponse } from "next/server";
import { EMAIL_BRAND, sendEmail } from "@/lib/email";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = {
  firstName?: string;
  email?: string;
  lang?: string;
  /** Honeypot — real users leave this empty. */
  website?: string;
};

/** Public URL base for the downloadable assets + email links. Must be www
 *  (the apex 308-redirects and some mail clients won't follow it). */
const BASE_URL = (process.env.APP_BASE_URL || "https://www.closebossai.com").replace(/\/$/, "");

/** CloseBoss "house" account that owns inbound product/marketing leads, so
 *  they're managed inside CloseBoss's own CRM rather than floating unowned.
 *  Defaults to the owner account (agents.id = 26); override per-env. */
function realtybossLeadsAgentId(): number {
  const n = Number(process.env.REALTYBOSS_LEADS_AGENT_ID);
  return Number.isInteger(n) && n > 0 ? n : 26;
}

const ASSETS = {
  en: {
    source: "lead_magnet_5prompts",
    pdf: `${BASE_URL}/downloads/CloseBoss_5_AI_Prompts.pdf`,
    subject: "Your 5 AI prompts are here 📥",
    heading: "Your 5 AI prompts every realtor should steal",
    body: (name: string, url: string) =>
      `Hi ${name},

Here they are — your 5 AI prompts every realtor should steal:

Download the prompts (PDF): ${url}

Quick tip: start with Prompt #2, the Lead Follow-Up Sequence. It's the one most agents tell us saved them a deal the same week. Paste it into any AI tool, swap in your lead's details, and you'll have a full multi-channel follow-up cadence in about 30 seconds.

One thing worth saying: these prompts write great drafts — but they can't hit "send" for you at 9pm, or call back the lead you missed during a showing. That's what CloseBoss is for — your AI real estate team. See it free at ${BASE_URL}/start-free.

For now — go steal Prompt #2.

— The ${EMAIL_BRAND} team
Your AI real estate team · closebossai.com`,
  },
  zh: {
    source: "lead_magnet_5prompts_zh",
    pdf: `${BASE_URL}/downloads/CloseBoss_5_AI_Prompts_ZH.pdf`,
    subject: "您的 5 个 AI 提示词到了 📥",
    heading: "每位地产经纪都该收藏的 5 个 AI 提示词",
    body: (name: string, url: string) =>
      `您好 ${name}，

给您 —— 每位地产经纪都该收藏的 5 个 AI 提示词：

下载提示词（PDF）：${url}

小技巧：先从第 2 个提示词「客户跟进序列」开始。很多经纪告诉我们，就是这个在当周帮他们保住了一单。把它粘贴到任何 AI 工具里，换上您客户的信息，大约 30 秒就能得到一整套多渠道的跟进节奏。

有句实话值得说：这些提示词能写出很棒的草稿 —— 但它没法替您在晚上 9 点点「发送」，也没法回拨您看房时错过的来电。那正是 CloseBoss 的用途 —— 您的 AI 房地产团队。免费体验：${BASE_URL}/start-free。

现在 —— 先把第 2 个提示词拿去用吧。

—— ${EMAIL_BRAND} 团队
您的 AI 房地产团队 · closebossai.com`,
  },
} as const;

function htmlEmail(heading: string, textBody: string, pdfUrl: string, ctaLabel: string) {
  const paragraphs = textBody
    .split("\n\n")
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6;color:#0f172a;">${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:8px;">
    <h1 style="font-size:20px;color:#0f172a;margin:0 0 20px;">${heading}</h1>
    <p style="margin:0 0 24px;">
      <a href="${pdfUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">${ctaLabel}</a>
    </p>
    ${paragraphs}
  </div>`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    // Honeypot: pretend success so bots don't learn anything.
    if (body.website) {
      return NextResponse.json({ ok: true, download: null });
    }

    const firstName = String(body.firstName ?? "").trim().slice(0, 80);
    const email = String(body.email ?? "").trim().toLowerCase();
    const lang = String(body.lang ?? "en").toLowerCase() === "zh" ? "zh" : "en";
    const asset = ASSETS[lang];

    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
    }

    const name = firstName || email.split("@")[0];

    // Record the capture as a CloseBoss product lead, owned by the CloseBoss
    // house account so it's managed inside CloseBoss's own CRM (same contacts
    // table, lifecycle_stage='lead'). The `source` tag is what the growth
    // funnel measures: download -> free signup -> paid.
    try {
      await supabaseServer.from("contacts").insert({
        agent_id: realtybossLeadsAgentId(),
        name,
        email,
        source: asset.source,
        traffic_source: `lead_magnet:5prompts:${lang}`,
        tool_used: "ai_prompts_download",
        lifecycle_stage: "lead",
        lead_status: "new",
      } as Record<string, unknown>);
    } catch (e) {
      console.error("prompts-download: contact insert failed", e);
    }

    // Deliver the asset by email (the day-0 touch). Best-effort — the client
    // also reveals a direct download link, so email failure never blocks it.
    const ctaLabel = lang === "zh" ? "下载提示词（PDF）" : "Download the prompts (PDF)";
    const text = asset.body(name, asset.pdf);
    try {
      await sendEmail({
        to: email,
        subject: asset.subject,
        text,
        html: htmlEmail(asset.heading, text, asset.pdf, ctaLabel),
      });
    } catch (e) {
      console.error("prompts-download: delivery email failed", e);
    }

    // Notify the team so we can watch the funnel in real time.
    const notifyTo = process.env.AGENT_NOTIFICATION_EMAIL;
    if (notifyTo) {
      try {
        await sendEmail({
          to: notifyTo,
          subject: `New lead-magnet download (${lang}): ${email}`,
          text: `5 AI Prompts download\n\nName: ${name}\nEmail: ${email}\nLanguage: ${lang}\nSource: ${asset.source}\nTime: ${new Date().toISOString()}`,
        });
      } catch (e) {
        console.error("prompts-download: team notify failed", e);
      }
    }

    return NextResponse.json({ ok: true, download: asset.pdf });
  } catch (error) {
    console.error("prompts-download: unhandled", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
