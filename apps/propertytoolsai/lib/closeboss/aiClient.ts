import { getCloseBossConfig } from "@/lib/closeboss/config";

type AiPayload = {
  leadScore: number;
  intent: string;
  timeline: string;
  confidence: number;
  explanation: string[];
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error(`AI timeout after ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(id);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(id);
        reject(e);
      });
  });
}

function fallback(payload: AiPayload) {
  return {
    ai_summary: `Lead scored ${Math.round(payload.leadScore)}/100 with ${payload.intent} intent and a likely ${payload.timeline} timeline.`,
    ai_next_best_action:
      payload.intent === "high"
        ? "Call within 15 minutes and offer a concise value review."
        : payload.intent === "medium"
          ? "Send a personalized market snapshot and ask one scheduling question."
          : "Start with low-friction education and re-engage in 48 hours.",
  };
}

export async function generateCloseBossNarrative(payload: AiPayload) {
  const cfg = getCloseBossConfig();
  if (!cfg.openaiApiKey) return fallback(payload);

  const prompt = `Return strict JSON with keys ai_summary and ai_next_best_action.
Context:
- lead_score: ${payload.leadScore}
- intent: ${payload.intent}
- timeline: ${payload.timeline}
- confidence: ${payload.confidence}
- explanation: ${payload.explanation.join("; ")}
Rules:
- ai_summary <= 2 sentences
- ai_next_best_action <= 1 sentence
- specific and practical`;

  let lastErr: any = null;
  for (let i = 0; i <= cfg.aiMaxRetries; i += 1) {
    try {
      const res = await withTimeout(
        fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.openaiApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: cfg.openaiModel,
            temperature: 0.3,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "You are a concise real-estate lead analyst." },
              { role: "user", content: prompt },
            ],
          }),
        }),
        cfg.aiTimeoutMs
      );
      if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
      const json = (await res.json()) as any;
      const content = String(json?.choices?.[0]?.message?.content ?? "").trim();
      const parsed = content ? JSON.parse(content) : {};
      return {
        ai_summary: String(parsed.ai_summary ?? fallback(payload).ai_summary),
        ai_next_best_action: String(parsed.ai_next_best_action ?? fallback(payload).ai_next_best_action),
      };
    } catch (e) {
      lastErr = e;
    }
  }
  return { ...fallback(payload), _error: String(lastErr?.message ?? "Unknown AI error") };
}
