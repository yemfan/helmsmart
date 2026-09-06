import type { HubConfig } from "@/lib/marketing-hub/config";
import type { HubMetrics } from "@/lib/marketing-hub/events";
import type { ResolvedBooking } from "@/lib/marketing-hub/loadHub";
import type { workforceEditorRows } from "@/lib/marketing-hub/workforce";

/** What GET /api/dashboard/hub/config returns. */
export type EditorData = {
  config: HubConfig;
  hasSavedConfig: boolean;
  identity: {
    username: string | null;
    published: boolean;
    bio: string | null;
    specialties: string[];
    brandName: string | null;
    profileAreas: string[];
  };
  agent: {
    name: string | null;
    brokerage: string | null;
    phone: string | null;
    email: string | null;
    licenseNumber: string | null;
    photoUrl: string | null;
    logoUrl: string | null;
  };
  workforce: ReturnType<typeof workforceEditorRows>;
  bookingEnabled: boolean;
  receptionistEnabled: boolean;
  booking: ResolvedBooking;
  posts: { slug: string; title: string; postedAt: string }[];
};

export type MetricsData = {
  metrics: HubMetrics;
  conversations: {
    id: string;
    messageCount: number;
    becameLead: boolean;
    contactId: string | null;
    createdAt: string;
    firstMessage: string;
  }[];
};

export type Testimonial = {
  id: string;
  rating: number | null;
  body: string;
  authorName: string | null;
  authorTitle: string | null;
  published: boolean;
  createdAt: string;
};

export type SectionKey =
  | "overview"
  | "profile"
  | "hero"
  | "services"
  | "assistant"
  | "workforce"
  | "tools"
  | "areas"
  | "content"
  | "social"
  | "leadCapture"
  | "trust"
  | "seo"
  | "appearance"
  | "analytics"
  | "settings";

export const SECTION_KEYS: SectionKey[] = [
  "overview",
  "profile",
  "hero",
  "services",
  "assistant",
  "workforce",
  "tools",
  "areas",
  "content",
  "social",
  "leadCapture",
  "trust",
  "seo",
  "appearance",
  "analytics",
  "settings",
];

/** Save one section of the document. Resolves with the fresh editor payload. */
export async function saveSection<K extends keyof HubConfig>(
  key: K,
  value: HubConfig[K],
): Promise<{ ok: true; data: EditorData } | { ok: false; message: string | null }> {
  try {
    const res = await fetch("/api/dashboard/hub/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [key]: value }),
    });
    const json = (await res.json().catch(() => ({}))) as
      | (EditorData & { ok: true })
      | { ok: false; error?: string; problems?: { path: string; message: string }[] };
    if (!json.ok) {
      const first = "problems" in json && json.problems?.[0];
      return { ok: false, message: first ? `${first.path}: ${first.message}` : null };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, message: null };
  }
}
