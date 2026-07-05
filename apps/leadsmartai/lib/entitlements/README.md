# LeadSmart AI Agent entitlements

## TypeScript layout (`lib/entitlements/`)

| File | Role |
|------|------|
| `getEntitlements.ts` | `getUserEntitlements`, `getAgentEntitlement`, `getActiveAgentEntitlement` |
| `usage.ts` | `utcTodayDateString`, `getTodayUsage`, CRM count helpers, `buildEntitlementSnapshot` |
| `limits.ts` | `canCreateCma`, `canAddLead`, `canAddContact`, `canDownloadFullReport`, `canInviteTeam`, cap helpers |
| `agentAccess.ts` | `hasAgentWorkspaceAccess`, `ensureAgentWorkspaceAccess` |
| `checkLimit.ts` | `checkAgentLimit` → routes to `limits` |
| `adminEntitlements.ts` | Service-role: `getUserEntitlements`, `getAgentEntitlement` (import as `entitlementsAdmin` from `index`) |
| `adminUsage.ts` | Service-role: `ensureDailyUsageRow`, `getTodayUsage`, `incrementUsage` (`entitlementsAdminUsage` namespace) |
| `accessResult.ts` | User-scoped `AccessResult` + `userId`-only API (`accessResult` namespace); simpler than `limits.ts` for leads/contacts |
| `types.ts` | Domain types: `ProductKey`, `AgentPlan`, `AlertsLevel`, `ReportsDownloadLevel`, `AgentEntitlement`, `AgentUsageDaily`, `AccessResult`, `LimitReason`, `EntitlementCheckResult` |
| `product.ts`, `types.ts`, `planCatalog.ts` | Constants & types |
| `index.ts` | Re-exports |

- **Product key:** `leadsmart_agent` (`PRODUCT_LEADSMART_AGENT`)
- **Plans:** `starter` | `growth` | `elite` — limits defined in `planCatalog.ts` and stored denormalized on `product_entitlements`.
- **Source:** optional `source` text on `product_entitlements` (e.g. `free_start`, `stripe`, `admin_grant`).
- **Caps:** `max_leads` / `max_contacts` may be `NULL` for unlimited (Premium). Legacy rows may use `-1` for the same meaning in app code.
- **Window:** optional `starts_at` / `ends_at` (`timestamptz`). View **`active_product_entitlements`** exposes rows with `is_active = true` and current time inside that window (NULL bounds = open-ended).
- **RPC:** `get_active_agent_entitlement(p_user_id uuid)` returns one row (or none) from that view for `product = leadsmart_agent` (use from SQL or `supabase.rpc`; `security invoker` respects RLS).
- **RPC:** `ensure_daily_usage_row(p_user_id, p_product)` inserts a today row into `entitlement_usage_daily` if missing (`on conflict do nothing`; `usage_date = current_date`).
- **RPC:** `increment_cma_usage(p_user_id, p_product default leadsmart_agent)` calls `ensure_daily_usage_row` then bumps `cma_reports_used` for `current_date` (does not enforce plan caps; use `try_consume_entitlement_daily` for limit checks).
- **RPC:** `increment_leads_usage(p_user_id, p_product default leadsmart_agent)` same pattern for `leads_used` (CRM lead-count limits are enforced separately via `max_leads` + live counts).
- **RPC:** `increment_contacts_usage(p_user_id, p_product default leadsmart_agent)` same pattern for `contacts_used` (`max_contacts` + live counts enforced separately).
- **View:** `current_agent_usage` — `entitlement_usage_daily` rows where `product = leadsmart_agent` (usage counters by day).
- **Workspace access:** `hasAgentWorkspaceAccess()` / `ensureAgentWorkspaceAccess()` — requires an **active** row for `leadsmart_agent`, or **platform `admin`** for internal preview.
- **Metering:** Daily UTC buckets in `entitlement_usage_daily`; CMA/report downloads use RPC `try_consume_entitlement_daily`. Lead/contact caps use live counts on `leads` / `contacts` for the user’s `agents.id`.
- **APIs:** `/api/entitlements/me`, `/api/agent/start-free`, `/api/agent/access-check`, `/api/agent/check-limit`, `/api/agent/consume-usage`.

Apply migration: `supabase/migrations/20260421000000_product_entitlements.sql`.
