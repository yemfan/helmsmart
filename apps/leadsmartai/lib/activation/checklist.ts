import "server-only";

import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Boss-guided activation checklist.
 *
 * A new agent's real "am I set up?" state, computed from actual data (not the
 * rubber-stamp `agents.onboarding_completed`, which is true for everyone). Each
 * step maps to a concrete activation signal and a one-click next action, so the
 * Boss Assistant can walk a new user from "signed up" to "AI team working".
 *
 * Shared by the dashboard panel (in-app) and the stall email nudge (cron), so
 * both judge activation the same way.
 */

export type ActivationStepKey =
  | "import_contacts"
  | "ai_receptionist"
  | "mobile_app"
  | "first_ai_call";

export type ActivationStep = {
  key: ActivationStepKey;
  title: string;
  /** One-line, Boss-voice explanation of why this step matters. */
  description: string;
  /** Button label. */
  cta: string;
  /** Primary link (internal route or external URL). */
  href?: string;
  /** Extra links, e.g. iOS + Android for the mobile-app step. */
  links?: { label: string; href: string }[];
  done: boolean;
};

export type ActivationChecklist = {
  steps: ActivationStep[];
  doneCount: number;
  total: number;
  complete: boolean;
  /** First not-done step — the single "next best action". */
  nextStepKey: ActivationStepKey | null;
};

async function countRows(
  table: string,
  col: string,
  val: string,
): Promise<number> {
  try {
    const { count } = await supabaseServer
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq(col, val as never);
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** Has the agent connected an AI receptionist? Either the receptionist is
 *  switched on, or they've set call-forwarding to it. */
async function receptionistConnected(agentId: string): Promise<boolean> {
  try {
    const [{ data: vr }, { data: ag }] = await Promise.all([
      supabaseServer
        .from("voice_receptionist_settings")
        .select("enabled, phone_number")
        .eq("agent_id", agentId as never)
        .maybeSingle(),
      supabaseServer
        .from("agents")
        .select("forwarding_phone")
        .eq("id", agentId as never)
        .maybeSingle(),
    ]);
    const enabled = Boolean((vr as { enabled?: boolean } | null)?.enabled);
    const forwarding = String(
      (ag as { forwarding_phone?: string | null } | null)?.forwarding_phone ?? "",
    ).trim();
    return enabled || forwarding.length > 0;
  } catch {
    return false;
  }
}

/** Has the user installed + opened the mobile app? A registered Expo push token
 *  means the app ran at least once on their device. */
async function mobileAppInstalled(userId: string): Promise<boolean> {
  try {
    const { count } = await supabaseServer
      .from("mobile_push_tokens")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId as never);
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

function appStoreLinks(): { label: string; href: string }[] {
  const ios = process.env.LEADSMART_IOS_APP_STORE_URL?.trim();
  const android = process.env.LEADSMART_ANDROID_PLAY_STORE_URL?.trim();
  const links: { label: string; href: string }[] = [];
  if (ios) links.push({ label: "App Store", href: ios });
  if (android) links.push({ label: "Google Play", href: android });
  return links;
}

/**
 * Compute the activation checklist for one agent. Best-effort — any failed
 * signal counts as "not done" rather than throwing, so the panel always renders.
 */
export async function computeActivationChecklist(
  agentId: string,
  userId: string,
): Promise<ActivationChecklist> {
  const [contacts, receptionist, mobile, calls] = await Promise.all([
    countRows("contacts", "agent_id", agentId),
    receptionistConnected(agentId),
    mobileAppInstalled(userId),
    countRows("call_logs", "agent_id", agentId),
  ]);

  const storeLinks = appStoreLinks();

  const steps: ActivationStep[] = [
    {
      key: "import_contacts",
      title: "Import your contacts",
      description:
        "Bring in your sphere so your AI team has people to work — nurture, follow up, and rate leads.",
      cta: "Import contacts",
      href: "/dashboard/leads/import",
      done: contacts > 0,
    },
    {
      key: "ai_receptionist",
      title: "Turn on your AI receptionist",
      description:
        "Let Lucy answer calls, book appointments, and capture leads 24/7 — even when you can't pick up.",
      cta: "Set up receptionist",
      href: "/dashboard/settings",
      done: receptionist,
    },
    {
      key: "mobile_app",
      title: "Get the mobile app",
      description:
        "Run your business from your pocket and get instant hot-lead and missed-call alerts.",
      cta: "Get the app",
      href: storeLinks[0]?.href,
      links: storeLinks.length > 0 ? storeLinks : undefined,
      done: mobile,
    },
    {
      key: "first_ai_call",
      title: "Make your first AI call",
      description:
        "Have your AI assistant call and qualify a lead for you — see your team close business hands-free.",
      cta: "Start a call",
      href: "/dashboard/leads",
      done: calls > 0,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const nextStep = steps.find((s) => !s.done) ?? null;

  return {
    steps,
    doneCount,
    total: steps.length,
    complete: doneCount === steps.length,
    nextStepKey: nextStep?.key ?? null,
  };
}
