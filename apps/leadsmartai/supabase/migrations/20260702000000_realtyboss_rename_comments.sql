-- PR-1 of HANDOFF_BOSS_V2: RealtorBoss → RealtyBoss rename.
-- Comment-only migration; no schema or data changes. Code paths referenced in
-- comments moved to lib/realtyboss/* and /api/dashboard/realtyboss/*.

comment on table public.ai_assistants is
  'Per-agent RealtyBoss AI team rows (boss/receptionist/sales/transaction). Seeded lazily from lib/realtyboss/team.ts on first /api/dashboard/realtyboss/team call. Pausing an assistant hides its recommendations + activity from the Boss dashboard.';

comment on table public.ai_skills is
  'RealtyBoss skill catalog. Prompt text source of truth lives in code (lib/ai/prompts/realtyboss/skills.ts); rows here back the AI-team configuration UI.';

comment on table public.boss_recommendations is
  'Boss Assistant Top Priorities. Synced deterministically from CRM signals (transaction deadlines, hot leads, missed calls, overdue tasks) by lib/realtyboss/recommendations.ts; agents accept/dismiss/complete via the dashboard.';
