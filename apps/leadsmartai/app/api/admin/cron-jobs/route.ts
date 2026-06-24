/**
 * Admin API: list cron jobs and manually trigger them.
 *
 * GET  /api/admin/cron-jobs          → list of jobs
 * POST /api/admin/cron-jobs          → { path: "/api/cron/…" } triggers a job now
 *
 * Both endpoints require an authenticated admin or support session.
 */
import { NextResponse } from "next/server";
import { requireRoleRoute } from "@/lib/auth/requireRole";
import { getSiteUrl } from "@/lib/siteUrl";

// ─── Job registry (mirrors vercel.json crons) ────────────────────────────────

export interface CronJob {
  id: string;
  label: string;
  path: string;
  schedule: string;
  description: string;
  category: "notifications" | "ai" | "leads" | "emails" | "data" | "tasks";
}

export const CRON_JOBS: CronJob[] = [
  // Notifications
  { id: "reminder-digest",        label: "Reminder Digest",           path: "/api/cron/reminder-notification-digest", schedule: "*/15 * * * *", description: "Agent reminder digest – runs every 15 minutes",                             category: "notifications" },
  // AI
  { id: "greetings",              label: "Greeting Emails",           path: "/api/jobs/greetings/run",                schedule: "0 14 * * *",   description: "Daily personalised greeting emails to active leads (2 PM UTC)",             category: "ai" },
  { id: "reengagement",           label: "Re-engagement",             path: "/api/jobs/reengagement/run",             schedule: "30 15 * * *",  description: "Daily re-engagement sequence for cold/inactive leads (3:30 PM UTC)",       category: "ai" },
  { id: "ai-followups",           label: "AI Follow-ups",             path: "/api/cron/ai-followups",                 schedule: "0 * * * *",    description: "Process scheduled 1h/24h/3d AI follow-up jobs – hourly",                  category: "ai" },
  { id: "smart-automation",       label: "Smart Automation",          path: "/api/cron/smart-automation",             schedule: "0 */6 * * *",  description: "Rule-based follow-ups (report_view, engagement, inactivity) – every 6h", category: "ai" },
  // Leads
  { id: "lead-followups",         label: "Lead Follow-ups",           path: "/api/cron/lead-followups",               schedule: "15 * * * *",   description: "Process queued follow-up jobs (email + SMS + push) – hourly",             category: "leads" },
  { id: "behavior-score",         label: "Behavior Score",            path: "/api/cron/behavior-score",               schedule: "0 1 * * *",    description: "Daily composite lead rating (behavior + calls/SMS/email/open-house) + intent signals", category: "leads" },
  { id: "lead-pricing-learning",  label: "Lead Pricing Learning",     path: "/api/cron/lead-pricing-learning",        schedule: "0 2 * * 3",    description: "Weekly learning loop to calibrate lead value model (Wednesdays)",         category: "leads" },
  // Emails
  { id: "send-emails",            label: "Send Emails",               path: "/api/cron/send-emails",                  schedule: "45 * * * *",   description: "Send queued outbound emails and SMS – hourly at :45",                    category: "emails" },
  // Data
  { id: "city-data-refresh",      label: "City Data Refresh",         path: "/api/cron/city-data-refresh",            schedule: "0 5 * * 1",    description: "Refresh local market stats (price, inventory, DOM) – Mondays",          category: "data" },
  { id: "leadsmart-refresh",      label: "LeadSmart Refresh",         path: "/api/cron/leadsmart-refresh",            schedule: "30 5 * * *",   description: "Nightly refresh of lead batch from LeadSmart service",                   category: "data" },
  // Tasks
  { id: "tasks-deferred",         label: "Deferred Tasks",            path: "/api/cron/tasks-deferred",               schedule: "0 7 * * *",    description: "Move deferred tasks to active when their due date arrives",              category: "tasks" },
];

// ─── GET – list jobs ──────────────────────────────────────────────────────────

export async function GET() {
  const auth = await requireRoleRoute(["admin", "support"]);
  if (auth.ok === false) return auth.response;

  return NextResponse.json({ ok: true, jobs: CRON_JOBS });
}

// ─── POST – trigger a job ────────────────────────────────────────────────────

export async function POST(req: Request) {
  const auth = await requireRoleRoute(["admin", "support"]);
  if (auth.ok === false) return auth.response;

  const body = await req.json().catch(() => ({}));
  const path = typeof body.path === "string" ? body.path.trim() : "";

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const job = CRON_JOBS.find((j) => j.path === path);
  if (!job) {
    return NextResponse.json({ error: "Unknown job path" }, { status: 404 });
  }

  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const secret = process.env.CRON_SECRET?.trim();

  const targetUrl = `${siteUrl}${path}`;
  const headers: Record<string, string> = {};
  if (secret) headers["Authorization"] = `Bearer ${secret}`;

  const start = Date.now();
  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(120_000),
    });

    const duration = Date.now() - start;
    let result: unknown;
    try {
      result = await res.json();
    } catch {
      result = { raw: await res.text() };
    }

    return NextResponse.json({ ok: res.ok, status: res.status, duration, result });
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      error: (e as Error).message ?? "Request failed",
      duration: Date.now() - start,
    });
  }
}
