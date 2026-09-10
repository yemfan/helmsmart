export type CloseBossIntent = "low" | "medium" | "high";
export type CloseBossTimeline = "0-3 months" | "3-6 months" | "6+ months";

export type CloseBossIntelligence = {
  lead_id: string;
  lead_score: number;
  intent: CloseBossIntent;
  timeline: CloseBossTimeline;
  confidence: number;
  explanation: string[];
  ai_summary: string;
  ai_next_best_action: string;
  model: string;
  latency_ms: number;
};

export type CloseBossRunRow = {
  status: "success" | "error";
  model?: string | null;
  score?: number | null;
  intent?: string | null;
  timeline?: string | null;
  confidence?: number | null;
  explanation?: string[];
  payload?: Record<string, any>;
  latency_ms?: number | null;
  error?: string | null;
};
