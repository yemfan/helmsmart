"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SalesModel } from "@/lib/sales-models";

/**
 * Model-Specific Tools — grid of tool cards.
 *
 * Each card shows the tool title (from `model.tools`) plus a generated
 * one-liner description and an "Open Tool" button. Clicking opens an
 * inline modal with a model-aware AI prompt template — the MVP
 * doesn't wire to a real model endpoint, so we hand the agent a
 * ready-to-paste prompt they can drop into ChatGPT / our existing
 * AI surfaces.
 *
 * The descriptions are computed locally (not in the config) because
 * they're simple derivations from the title + the model's tone — keeps
 * `lib/sales-models.ts` from bloating.
 */
export function ModelToolsGrid({ model }: { model: SalesModel }) {
  const { t } = useTranslation("dashboard");
  const [openTool, setOpenTool] = useState<string | null>(null);

  return (
    <section
      aria-label={t("pages.salesModelBits.modelTools")}
      className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm"
    >
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{t("pages.dashFragments.toolsFor")} {model.name.replace(/ Model$/, "s")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t("pages.salesModelBits.tapTool")}</p>
      </header>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {model.tools.map((tool) => (
          <li key={tool}>
            <article className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm">
              <h3 className="text-sm font-semibold text-slate-900">{tool}</h3>
              <p className="mt-1 flex-1 text-xs leading-relaxed text-slate-600">
                {describeTool(tool, model)}
              </p>
              <button
                type="button"
                onClick={() => setOpenTool(tool)}
                className="mt-3 inline-flex items-center justify-center self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                Open Tool →
              </button>
            </article>
          </li>
        ))}
      </ul>

      {openTool ? (
        <ToolPromptModal
          tool={openTool}
          model={model}
          onClose={() => setOpenTool(null)}
        />
      ) : null}
    </section>
  );
}

function describeTool(tool: string, model: SalesModel): string {
  // Generate a sentence that names the tone so the description feels
  // model-aware without storing per-tool copy in the config.
  const toneClause = model.tone.split(",")[0]?.toLowerCase() ?? "balanced";
  return `Generates a ${toneClause} ${tool.replace(/ Generator$|Tool$/, "").toLowerCase()} you can adapt and send.`;
}

/**
 * Lightweight modal that surfaces an AI prompt template tuned to the
 * selected model. MVP: copy-to-clipboard. The text is the value — it
 * encodes the agent's identity, tone, and lead context so they can
 * paste it into our existing AI Chat panel or any LLM and get
 * model-coherent output without re-explaining who they are.
 */
function ToolPromptModal({
  tool,
  model,
  onClose,
}: {
  tool: string;
  model: SalesModel;
  onClose: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const [copied, setCopied] = useState(false);
  const prompt = buildPromptFor(tool, model);

  // Esc-to-close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (Safari without HTTPS, locked iframe) —
      // user can still select-all + copy manually.
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tool-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-900/10">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 id="tool-prompt-title" className="text-base font-semibold text-slate-900">
            {tool}
          </h3>
          <p className="mt-1 text-xs text-slate-600">{t("pages.dashFragments.promptTunedFor")} {model.name.replace(/ Model$/, "")} {t("pages.dashFragments.toneCopyPaste")}</p>
        </div>
        <pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words bg-slate-50 px-6 py-4 font-mono text-xs leading-relaxed text-slate-800">
          {prompt}
        </pre>
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50"
          >{t("pages.salesModelBits.close")}</button>
          <button
            type="button"
            onClick={onCopy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {copied ? "Copied!" : "Copy prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}

function buildPromptFor(tool: string, model: SalesModel): string {
  return `You are a real estate agent operating as a ${model.identityTitle.replace(
    /^You are operating as (a |an )?/,
    "",
  )}.

Your communication style: ${model.tone}.
Your philosophy: ${model.philosophy}
You typically work with: ${model.leadTypes.join(", ")}.

Tool: ${tool}

Task:
${describeToolTask(tool)}

Output requirements:
- Match the tone above exactly.
- Keep it usable as-is — minimal placeholders.
- Length: 80–180 words unless otherwise required by the format.
- If the tool format is a script/post/caption, write it ready-to-send.
`;
}

function describeToolTask(tool: string): string {
  // Curated task descriptions for the tools across all four models so
  // the prompt feels concrete instead of "do the thing called {tool}".
  const map: Record<string, string> = {
    "Xiaohongshu Post Generator":
      "Write a Xiaohongshu (Little Red Book) post in Mandarin that opens with a hook, gives one concrete real-estate insight, and ends with a soft CTA to DM for a consultation.",
    "Instagram Caption Generator":
      "Write an Instagram caption (max 2200 chars) with a hook in the first line, a story arc, and a clear next step the viewer can take.",
    "DM Reply Assistant":
      "Draft a friendly, helpful DM reply that acknowledges the question, gives one specific value-add, and proposes a low-friction next step.",
    "Video Hook Generator":
      "Generate 5 short-form video hooks (≤8 words each) optimized for the first 1.5s of a Reel/Short.",
    "Content Calendar":
      "Outline a 7-day content calendar with one specific post per day (mix of educational, story, and CTA).",
    "Cold Call Script Generator":
      "Write a cold-call opener with a pattern interrupt, a one-line value prop, and a soft commitment question.",
    "Objection Handler":
      "Take the objection the user supplies and produce three possible responses: acknowledge, reframe, and re-direct to commitment.",
    "Follow-up Script Generator":
      "Write a follow-up script for a previously-contacted lead — open warmly, reference prior context, and ask for a small next step.",
    "Appointment Setter":
      "Draft a script that converts a qualified prospect into an in-person or video meeting this week. Offer two specific time options.",
    "Daily Prospecting Plan":
      "Generate a 90-minute prospecting block: target list type, opening script, time-block breakdown, and one mental rehearsal.",
    "Client Analyzer":
      "Given the agent-supplied client notes, produce: motivation summary, decision style, top 3 risks, and recommended next conversation.",
    "Buyer Strategy Generator":
      "Build a buyer strategy: target price band, must-have / nice-to-have, financing approach, search radius, and 30-day plan.",
    "Property Risk Assessment":
      "Score the supplied property on price (vs comps), condition, location risk, and resale risk. Output 1–5 per axis with one-line rationale.",
    "Market Insight Generator":
      "Write a calm, analytical paragraph the agent can send to a client summarizing the latest local market trend in plain language.",
    "Consultation Script Builder":
      "Build a discovery-call script: warm open, 4 framing questions, a shared-risk acknowledgement, and a commitment question.",
    "Contact Manager":
      "Suggest the next outreach move for the supplied contact based on last touch, source, and lead status. One concrete action.",
    "Lead Inbox":
      "Triage the supplied list of unread messages: which is hottest, which can wait, and a one-line response template per item.",
    "Message Composer":
      "Compose a personal outreach message that reads like the agent wrote it — natural tone, specific to the recipient, ends with one clear question.",
    "Property Tools":
      "Open the standard LeadSmart property toolkit prompts — pick the closest match (CMA, valuation, neighborhood report) for the supplied request.",
    "Marketing Plans":
      "Outline a 30-day marketing plan tailored to the agent's market and lead source mix. Weekly goals + measurable check-ins.",
  };
  return (
    map[tool] ??
    `Generate the output appropriate for "${tool}". Ask for any missing context once, then produce the deliverable.`
  );
}
