import { NextResponse } from "next/server";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { supabaseServer } from "@/lib/supabaseServer";
import { computeActivationChecklist } from "@/lib/activation/checklist";
import OpenAI from "openai";

export const runtime = "nodejs";

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/**
 * Boss onboarding conversation — POST /api/dashboard/boss/onboarding
 *
 * The Boss Assistant as a proactive communication channel: it opens the
 * conversation, walks a new agent through setup, and explains each function in
 * terms of what it does for their business. Boss's guidance is AI-generated but
 * grounded in the REAL activation state (computeActivationChecklist), so it only
 * ever nudges the next unfinished step and never re-pitches something done.
 *
 * Body: { message?: string, history?: {role,content}[] }. With no message and
 * no history, Boss generates its proactive opening. Returns { reply, checklist }.
 */
export async function POST(req: Request) {
  try {
    const { agentId, userId, planType } = await getCurrentAgentContext();
    const body = await req.json().catch(() => ({}));
    const message: string = String(body?.message ?? "").trim();
    const history = Array.isArray(body?.history) ? body.history : [];

    const checklist = await computeActivationChecklist(agentId, userId);

    const openai = getOpenAI();
    if (!openai) {
      // Graceful fallback so the card still guides setup without an LLM.
      const next = checklist.steps.find((s) => !s.key || !s.done) ?? null;
      const reply = checklist.complete
        ? "You're all set up — your AI team is ready. Ask me to call your hottest lead or draft a follow-up whenever you like."
        : next
          ? `Let's get your business running. Next up: ${next.title.toLowerCase()} — ${next.description}`
          : "Let's get you set up.";
      return NextResponse.json({ ok: true, reply, checklist });
    }

    // Personalization: agent's name + brand.
    const [{ data: profile }, { data: agent }] = await Promise.all([
      supabaseServer
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", userId as never)
        .maybeSingle(),
      supabaseServer
        .from("agents")
        .select("brand_name")
        .eq("id", agentId as never)
        .maybeSingle(),
    ]);
    const fullName = String(
      (profile as { full_name?: string | null } | null)?.full_name ?? "",
    ).trim();
    const firstName = fullName.split(/\s+/)[0] || "";
    const brand = String(
      (agent as { brand_name?: string | null } | null)?.brand_name ?? "",
    ).trim();

    const stepLines = checklist.steps
      .map(
        (s) =>
          `- ${s.done ? "[DONE]" : "[TODO]"} ${s.title}: ${s.description}`,
      )
      .join("\n");
    const nextStep = checklist.steps.find((s) => !s.done) ?? null;

    const systemPrompt = `You are Max, the Captain of the agent's AI real estate team on CloseBoss (an AI company working for the agent — the agent is the CEO, you coordinate the team, the team does the work): Emma the AI Receptionist (answers calls, books appointments), Chris the AI Sales Specialist (calls and texts leads), Ruby the AI Marketing Specialist (social + content), Grace the AI Transaction Coordinator (deadlines + docs), and Oliver the AI Financial Analyst (commission + numbers).

Your job right now is ONBOARDING: proactively welcome the agent, guide them to set up smoothly, and introduce what each function does FOR THEIR BUSINESS (more booked appointments, never miss a lead, less admin, faster follow-up). You are a warm, concise communication channel — not a form.

Rules:
- Speak in the first person as Max, the calm, confident captain — never a chatbot. Address the agent${firstName ? ` by their first name (${firstName})` : ""} naturally, not every message.
- Keep replies short: 2-4 sentences, conversational, no markdown headings. At most one short bullet list.
- Focus on the SINGLE next unfinished setup step. Explain why it helps their business, then invite them to do it. Never re-pitch a step marked [DONE].
- When everything is set up, congratulate them briefly and suggest one high-value thing to try (e.g. "ask me to call your hottest lead").
- Do not invent features. Only reference the setup steps and the AI team above.
- End with a light, specific nudge or question that moves them forward.

The agent's business: ${brand || "(brand not set yet)"}. Plan: ${planType || "free"}.

Current setup state (the ground truth — trust this over anything the agent says):
${stepLines}

${nextStep ? `The next step to guide them toward is: "${nextStep.title}".` : "All setup steps are complete."}`;

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];
    for (const h of history.slice(-10)) {
      if (h?.role === "user" || h?.role === "assistant") {
        messages.push({ role: h.role, content: String(h.content) });
      }
    }
    // No user message + no history => generate the proactive opening.
    messages.push({
      role: "user",
      content:
        message ||
        "[The agent just opened their dashboard. Send your opening message: greet them, say in one line how your AI team helps their business, then guide the next setup step.]",
    });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      messages,
      max_tokens: 300,
      temperature: 0.6,
    });

    const reply =
      completion.choices[0]?.message?.content?.trim() ||
      "Let's get your AI team set up — ready when you are.";

    return NextResponse.json({ ok: true, reply, checklist });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Boss onboarding error";
    console.error("boss/onboarding error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
