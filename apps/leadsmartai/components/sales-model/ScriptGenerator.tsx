"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AiActionGateBanner } from "@/components/entitlements/AiActionGateBanner";
import {
  detectAiActionGate,
  type AiActionGate,
} from "@/lib/entitlements/aiActionGate";
import {
  SCRIPT_KINDS,
  type SalesModel,
  type ScriptKind,
} from "@/lib/sales-models";

/**
 * Script Generator.
 *
 * Calls `POST /api/sales-model/generate-script` (real LLM under the
 * hood) so the output reasons about the agent's actual situation,
 * not just substring-substitutes it into a template. The route
 * applies the model's identity + tone as the system prompt and asks
 * the LLM to *classify* what kind of message the situation calls
 * for (DM reply / follow-up / objection handling / appointment
 * setting / consultation opening) before generating it.
 *
 * The classification comes back as `detectedKind` so we can show
 * the agent the AI's read on the situation — useful both as a
 * confidence signal and as feedback when the read is wrong (so the
 * agent can rephrase the situation).
 *
 * Fallback to local templates is preserved for two cases:
 *   1. AI is not configured on the environment (preview / dev
 *      without an OpenAI key) — route returns 503 `ai_unconfigured`,
 *      we render the local template so the screen remains useful.
 *   2. The agent has hit their AI quota (402) — we surface the
 *      error inline AND render the local template as a degraded
 *      output so they can still get *something* without going to
 *      billing.
 *
 * Every other failure (network, 500, malformed body) shows an
 * error and lets the user retry.
 */
export function ScriptGenerator({ model }: { model: SalesModel }) {
  const { t } = useTranslation("dashboard");
  const [situation, setSituation] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);
  const [detectedKind, setDetectedKind] = useState<ScriptKind | null>(null);
  // Sticky entitlement gate when /api/sales-model/generate-script
  // returns 402 with `no_agent_entitlement` or `ai_usage_limit_reached`.
  // We still degrade to the local template so the agent isn't stuck —
  // the banner sits above it as the actionable next step.
  const [gate, setGate] = useState<AiActionGate | null>(null);

  const onGenerate = async () => {
    const trimmed = situation.trim();
    if (!trimmed) {
      setError("Describe the situation first — the AI uses it to tailor the script.");
      return;
    }
    setBusy(true);
    setError(null);
    setOutput(null);
    setDetectedKind(null);
    setSource(null);
    setGate(null);

    try {
      const res = await fetch("/api/sales-model/generate-script", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        // No `kind` — the API auto-classifies and returns its pick
        // as `detectedKind` so we can show the agent what the AI read.
        body: JSON.stringify({ situation: trimmed, salesModel: model.id }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        script?: string;
        detectedKind?: string | null;
        source?: "ai" | "fallback";
        error?: string;
        code?: string;
      } | null;

      if (res.ok && json?.ok && typeof json.script === "string" && json.script.trim()) {
        setOutput(json.script.trim());
        setSource(json.source ?? "ai");
        // Trust the model's classification only if it's a known kind.
        const dk = json.detectedKind;
        const dkValid =
          typeof dk === "string" &&
          (SCRIPT_KINDS.find((k) => k.value === dk)?.value ?? null);
        setDetectedKind((dkValid as ScriptKind) ?? null);
        return;
      }

      // Soft-fail to local template only for "AI unavailable on this
      // env" or "out of quota". Hard errors (auth, validation) get
      // surfaced — the local template wouldn't fix them.
      const code = json?.code;
      const aiGate = detectAiActionGate(res.status, json);
      if (aiGate) {
        const local = generateLocalScript({ model, situation: trimmed });
        setOutput(local);
        setSource("fallback");
        setGate(aiGate);
        return;
      }
      if (code === "ai_unconfigured") {
        const local = generateLocalScript({ model, situation: trimmed });
        setOutput(local);
        setSource("fallback");
        setError(
          "AI is not configured on this environment — showing a template instead. Set OPENAI_API_KEY to enable AI.",
        );
        return;
      }

      setError(json?.error ?? `Could not generate script (HTTP ${res.status}).`);
    } catch (e) {
      // Network error — fall back to local template so the agent
      // isn't stuck staring at a spinner-then-error.
      const local = generateLocalScript({ model, situation: trimmed });
      setOutput(local);
      setSource("fallback");
      setError(
        e instanceof Error
          ? `Network error: ${e.message} — showing a template instead.`
          : "Network error — showing a template instead.",
      );
    } finally {
      setBusy(false);
    }
  };

  const [copied, setCopied] = useState(false);
  const onCopy = async () => {
    if (!output) return;
    let ok = false;
    try {
      await navigator.clipboard.writeText(output);
      ok = true;
    } catch {
      // Clipboard API can throw in non-HTTPS contexts, locked
      // iframes, or when the document doesn't have focus. Fall
      // back to a hidden-textarea + execCommand so we still get
      // something on the user's clipboard rather than failing
      // silently like before.
      try {
        const ta = document.createElement("textarea");
        ta.value = output;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopied(true);
      // 1.6s feels right — long enough to register, short enough
      // to disappear before the agent moves on. Matches the
      // Tool-prompt-modal copy button so the feedback feels
      // consistent across the screen.
      window.setTimeout(() => setCopied(false), 1600);
    }
  };

  const detectedLabel = detectedKind
    ? SCRIPT_KINDS.find((k) => k.value === detectedKind)?.label
    : null;

  return (
    <section
      aria-label={t("pages.scriptGenerator.ariaLabel")}
      className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm"
    >
      <header className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{t("pages.scriptGenerator.title")}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("pages.dashFragments.describeSituation")}{" "}
          <span className="font-medium text-slate-800">{model.name}</span> tone.
        </p>
      </header>

      <div>
        <label
          htmlFor="script-situation"
          className="block text-xs font-semibold uppercase tracking-wider text-slate-500"
        >{t("pages.scriptGenerator.describe")}</label>
        <textarea
          id="script-situation"
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          placeholder={t("pages.scriptGenerator.placeholder")}
          rows={4}
          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <p className="mt-1.5 text-xs text-slate-500">{t("pages.scriptGenerator.hint")}</p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void onGenerate()}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? t("common:status.generating") : t("pages.scriptGenerator.generateScript")}
        </button>
        {output ? (
          <button
            type="button"
            onClick={() => void onCopy()}
            aria-label={copied ? t("pages.scriptGenerator.copied") : t("pages.scriptGenerator.copyScript")}
            className={[
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition",
              copied
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
            ].join(" ")}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? t("common:actions.copied_bang") : t("common:actions.copy")}
          </button>
        ) : null}
        {source ? (
          <span
            className={[
              "ml-1 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
              source === "ai"
                ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200"
                : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200",
            ].join(" ")}
          >
            {source === "ai" ? t("pages.scriptGenerator.aiGenerated") : t("pages.scriptGenerator.templateFallback")}
          </span>
        ) : null}
        {detectedLabel ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200">{t("pages.dashFragments.readAs")} {detectedLabel}
          </span>
        ) : null}
      </div>

      {gate ? <AiActionGateBanner reason={gate.reason} className="mt-3" /> : null}
      {error ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {error}
        </div>
      ) : null}

      {output ? (
        // Output panel with a floating copy affordance pinned to the
        // top-right. Two copy entry points (this one + the action-row
        // button above) is intentional — agents reading the output are
        // already looking at this region, and the action-row button
        // can scroll out of view on long scripts.
        <div className="relative mt-4">
          <button
            type="button"
            onClick={() => void onCopy()}
            aria-label={copied ? t("pages.scriptGenerator.copied") : t("pages.scriptGenerator.copyScript")}
            className={[
              "absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium shadow-sm transition",
              copied
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-slate-200 bg-white/90 text-slate-700 backdrop-blur hover:border-slate-300 hover:bg-white",
            ].join(" ")}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? t("common:actions.copied") : t("common:actions.copy")}
          </button>
          <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 pr-20 font-mono text-xs leading-relaxed text-slate-800">
            {output}
          </pre>
        </div>
      ) : null}
    </section>
  );
}

// ── Inline icons ──────────────────────────────────────────────────
//
// 14×14 currentColor SVGs so the copy/check pair stays visually
// balanced and inherits the button's text color in both default +
// "copied" states. Inlined to avoid pulling in an icon-pack
// dependency for two glyphs.

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

/**
 * Local fallback generator — used when the AI route returns 503
 * (`ai_unconfigured`) or 402 (quota), or on network failure. The
 * online path goes through `/api/sales-model/generate-script` which
 * actually classifies the situation and reasons about it; this
 * function just gives the agent something tone-correct when AI
 * isn't available so they aren't stuck on an error.
 *
 * One template per model (no per-kind branching since the user no
 * longer picks a kind). The structure is intentionally generic
 * (acknowledge → context → ask), tuned only for tone — agents will
 * paraphrase before sending in the rare case this fires.
 */
function generateLocalScript({
  model,
  situation,
}: {
  model: SalesModel;
  situation: string;
}): string {
  const ctx = situation || "what you're working through";
  switch (model.id) {
    case "advisor":
      return `Thanks for sharing the context — happy to think through this with you.

Quick read on the situation: ${ctx}. There are usually two or three angles worth checking before we make any decisions, and the most useful next step is usually a short call where we line them up against your actual goal.

Open to a 15-minute call this week, or would a written summary be more useful first? Either works.`;
    case "closer":
      return `Quick note on this: ${ctx}.

Three questions: are you actively looking right now? Has anything shifted on your timeline? And what would make this an obvious yes vs. an obvious wait?

I have time tomorrow at 10am or 2pm — which works better for a 15-minute call?`;
    case "influencer":
      return `Heyyy 👋 thanks for the context!

Okay so on ${ctx} — this comes up a lot and there's actually a really helpful way to think about it that most people don't know. I'll send a quick voice note with my take if that's easier, or we can hop on a 10-min call. Whatever feels good 💛`;
    case "custom":
      return `Thanks for the context. Here's how I'd suggest we move forward:

Based on the situation (${ctx}), the most useful next step is a short conversation to align on what you're trying to accomplish and the constraints we should plan around.

I have a few openings this week — Tuesday 10am, Wednesday 2pm, or Thursday 4pm. Which works best?`;
  }
}
