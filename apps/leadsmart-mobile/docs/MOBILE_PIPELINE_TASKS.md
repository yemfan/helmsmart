# Mobile pipeline & tasks integration

## API surface (CloseBoss CRM)

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/mobile/tasks` | Open tasks grouped as `overdue`, `today`, `upcoming`, plus `stages` (pipeline options). |
| `POST` | `/api/mobile/tasks` | Create a task (`lead_id`, `title`, optional `description`, `due_at`, `priority`, `task_type`). |
| `PATCH` | `/api/mobile/tasks/:id` | Update task; `status: "done"` sets `completed_at` on the server. |
| `PATCH` | `/api/mobile/leads/:id/pipeline-stage` | One-tap pipeline: `{ "stage_slug": "qualified" }` or `{ "pipeline_stage_id": "<uuid>" \| null }`. |

Lead detail `GET /api/mobile/leads/:id` includes `pipeline`, `pipeline_stages`, and `next_open_task` for the same agent-scoped lead.

## Pipeline slugs

Canonical mobile slugs (mapped server-side onto `crm_pipeline_stages`) are exported from `@leadsmart/shared` as `MOBILE_PIPELINE_SLUGS` / `MOBILE_PIPELINE_LABELS`: `new`, `contacted`, `qualified`, `showing`, `offer`, `closed`.

## Task grouping (UTC)

Buckets on `GET /api/mobile/tasks` use **UTC calendar days** for “today” vs “overdue” vs “upcoming”. The Tasks tab hints call this out so agents are not surprised when local midnight differs from UTC.

## AI / automation-ready tasks

`lead_tasks` supports `metadata_json`, `created_by`, and `task_type`. The mobile composer sends `task_type: null` by default; server-side or future clients can set `task_type` (for example `ai_suggested`) and stash provenance in `metadata_json` without API shape changes.

## Mobile app modules

- **Tasks tab:** `app/(tabs)/tasks.tsx` — loading, pull-to-refresh, empty state, section errors on complete.
- **Lead detail:** `app/lead/[id].tsx` — `PipelineStagePicker`, next-task `TaskCard`, `TaskComposerModal` (demo lead hides CRM pipeline/tasks).
- **API client:** `lib/closeBossMobileApi.ts` — `fetchMobileTasks`, `postMobileTask`, `patchMobileTask`, `patchLeadPipelineStage`, extended `fetchMobileLeadDetail` parsing with safe defaults for older servers.

## Deploy checklist

1. Apply Supabase migrations that add `lead_tasks` columns used by mobile (`completed_at`, `metadata_json`, indexes as shipped in the CloseBoss migration set).
2. Ensure `crm_pipeline_stages` rows exist for the agent so `listMobilePipelineStages` can resolve all six mobile slugs.
3. Point the Expo app at a CRM build that exposes the routes above (`EXPO_PUBLIC_LEADSMART_API_URL` + bearer token).
