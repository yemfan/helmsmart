# Ask Max — Capability Coverage Map

_Goal: Ask Max (the Captain) should be able to run **every** capability the app has — "every request is a Mission." This maps what the app can do against what Ask Max can invoke today, and lays out a phased plan to close the gap._

## How Ask Max executes (the extension point)

Ask Max runs on the **Boss v2 tool-loop**: `apps/leadsmartai/lib/boss/tools/registry.ts` → `ALL_TOOLS`. The model is handed the tool catalog and calls tools; the central executor (`lib/boss/tools/execute.ts`) owns every safety rail (autopilot resolution, ask-mode never-send, consent, per-run voice cap, budgets, idempotency, audit).

**Adding a capability to Ask Max = adding one `BossTool` to `ALL_TOOLS`** (+ update the assertion in `lib/boss/tools/__tests__/registry.test.ts`). Each tool declares: `name`, `description` (shown to the model), `inputSchema` (zod), `riskClass` (`research | draft | crm_write | outbound | financial`), `assignee` (which AI employee), optional `outbound` spec, and `execute` / `propose`.

There is a **second, older engine** — the action registry (`lib/closeboss/actions/registry.ts`) — used when Boss v2 is off. It already implements several capabilities the tool-loop lacks; those are the cheapest wins (wrap existing code).

## Legend

- ✅ **In Ask Max** — one of the 15 live tools
- 🟡 **Agentized, not in the loop** — exists in the action registry; wrap it as a `BossTool`
- 🔴 **Pure UI** — not agentized in either engine; decide if it should be a Mission
- ⛔ **Stays human** — setup/identity/financial-authorization/legal; Max links to the UI, never does it

---

> **Progress:**
> - Phase 1 shipped — `run_skill` (#1113) + `setup_open_house`, `coordinate_closing`, `start_selling_playbook`, `start_buying_playbook` (#1114). All five verified end-to-end in production. Buyer-saved-search and cold-call-qualify turned out already-reachable by composition, so no separate tools.
> - Phase 2 (read tools) COMPLETE — `get_pipeline`, `get_deals`, `get_financials` (#1115) + `get_calendar`, `get_sphere_signals`, `get_performance` (#1117).
>
> - Phase 4 (UX audit) — Max memory: `remember_note` + `forget_note`, post-run extraction into `boss_memories`, Settings › AI team › What Max remembers. Max no longer starts fresh.
>
> Ask Max is now at **29 tools**.

## Ask Max today — the core tools

| Tool | Capability | Employee |
|---|---|---|
| `run_cma` | Comparative market analysis / pricing | Chris (Sales) |
| `house_search` | Run an AI buyer house search | Chris (Sales) |
| `generate_seller_presentation` | Win-the-listing pitch deck | Chris (Sales) |
| `generate_deep_report` | Buyer-decision deep report | Chris (Sales) |
| `draft_message` | Draft SMS/email | Chris / Emma |
| `send_message` | Send SMS/email (gated) | Chris (Sales) |
| `schedule_voice_call` | Outbound AI voice call (gated) | Emma (Reception) |
| `create_task` | CRM task | (general) |
| `create_calendar_event` | Calendar event | (general) |
| `publish_social_post` | Publish a social post (gated) | Ruby (Marketing) |
| `schedule_social_post` | Schedule a social post | Ruby (Marketing) |
| `create_avatar_video` | Talking-head digital-twin video | Ruby (Marketing) |
| `import_contacts_from_file` | Import contacts from a file | Emma (Reception) |
| `query_crm` | Look up contacts / CRM read | (general) |
| `get_market_snapshot` | Market data snapshot | (general) |

**Reading the map:** Max can *do* a lot of marketing/sales artifacts, but he can't yet *answer questions* about the business (pipeline, deals at risk, money) and can't reach the playbooks, the 59-skill catalog, or most of the transaction/accountant/receptionist surface.

---

## Coverage by employee

### Chris — Sales
| Capability | Status | Route / source |
|---|---|---|
| CMA / pricing | ✅ `run_cma` | `/dashboard/cma` |
| Seller presentation | ✅ `generate_seller_presentation` | `/dashboard/presentations` |
| Deep report | ✅ `generate_deep_report` | `/dashboard/deep-report` |
| One-off house search | ✅ `house_search` | `/dashboard/house-search` |
| Saved buyer search + auto-email matches | ✅ `house_search` (contact_id + auto_run_frequency) | `saved-searches` |
| Cold-call & qualify a lead | ✅ `query_crm` → `schedule_voice_call` | `voice/outbound-call` |
| Schedule a showing | 🟡 composable via `create_task` | `/dashboard/showings` |
| **Start buying playbook** (stateful engagement) | ✅ `start_buying_playbook` | `/dashboard/playbook-runs` |
| Draft/send outreach (SMS/email/voice) | ✅ draft/send/voice | Sales composer |
| Sphere likely-buyer / likely-seller outreach | 🔴 | `sphere/likely-buyers…/outreach-message`, `…/equity-message/send` |
| Smart lists / dynamic segments | 🔴 | `smart-lists` |
| Lead pipeline plan / nurture / deal prediction | 🔴 | `leads/[id]/ai-pipeline-plan`, `deal-prediction` |
| Suggested properties for a contact | 🔴 | `contacts/[id]/suggested-properties` |
| Lead-source ROI | 🔴 | `/dashboard/lead-source-roi` |

### Ruby — Marketing
| Capability | Status | Route / source |
|---|---|---|
| Publish / schedule social post | ✅ `publish_social_post`, `schedule_social_post` | Generate → posts |
| Avatar (digital-twin) video | ✅ `create_avatar_video` | avatar studio |
| **Single social post (draft+schedule)** | 🟡 `post_social` | (overlaps ✅) |
| **Open house** (playbook: CMA + dated checklist) | ✅ `setup_open_house` | `/dashboard/open-houses` |
| **Start selling playbook** (marketing plan + 3 ads + rollout) | ✅ `start_selling_playbook` | `/dashboard/playbook-runs` |
| Marketing plan (standalone) | 🔴 | `/dashboard/marketing/plans` |
| Listing → ad reel / ad video | 🔴 | `listings/[id]/ad-reel`, `/ad-video` |
| Postcards (single / bulk direct mail) | 🔴 | `postcards`, `/bulk` |
| Flyer generation | 🔴 | `flyer`, `/dashboard/open-houses/flyer` |
| Client newsletter (generate + send) | 🔴 | `ClientNewsletterCard`, newsletter API |
| Weekly social schedule (set up / adjust) | 🔴 | `social/weekly-schedule` |
| Just-sold auto-post to Facebook | 🔴 | `transactions/[id]/post-to-facebook` |
| Connect a social account | ⛔ (OAuth) | `generate/connect` |

### Grace — Transaction Coordinator
| Capability | Status | Route / source |
|---|---|---|
| **Coordinate closing** (deadline timeline) | ✅ `coordinate_closing` | `/dashboard/transactions` |
| Create / update a transaction | 🔴 | `/dashboard/transactions/new` |
| Deal task checklist (add/update) | 🔴 | `transactions/[id]/tasks` |
| Deadlines & health / risk assessment | 🔴 | `/dashboard/ai-transaction-assistant` |
| Deal coach (pricing/risk/negotiation) | 🔴 | `/dashboard/deal-coach` |
| AI contract review / extraction | 🔴 | `contracts/review`, `extract-contract` |
| Compare seller offers + net-to-seller sheet | 🔴 | `listing-offers/compare`, `net-to-seller-pdf` |
| Counterparty tracking | 🔴 | `transactions/[id]/counterparties` |

### Oliver — Accountant
| Capability | Status | Route / source |
|---|---|---|
| Commission pipeline / next payout (answer) | 🔴 | `/dashboard/ai-accountant` |
| Log an expense | 🔴 | `books/expenses` |
| Create / send an invoice | 🔴 | `books/invoices`, `/send` |
| Expenses summary (answer) | 🔴 | `/dashboard/expenses` |
| Commission preferences | ⛔ (financial config) | `settings/commission-prefs` |

### Emma — Receptionist
| Capability | Status | Route / source |
|---|---|---|
| Outbound AI call | ✅ `schedule_voice_call` | `voice/outbound-call` |
| Import contacts from a file | ✅ `import_contacts_from_file` | `/dashboard/contacts/import-file` |
| Bulk outbound calls | 🔴 | `voice/outbound-call/bulk` |
| Appointment-reminder calls/messages | 🔴 | `voice/appointment-reminders` |
| Missed-call text-back (config / status) | 🔴 | `missed-call/settings` |
| Call-log summary (answer) | 🔴 | `/dashboard/calls`, `/dashboard/inbox` |

### General / cross-cutting
| Capability | Status | Route / source |
|---|---|---|
| Look up contacts | ✅ `query_crm` | — |
| Market snapshot | ✅ `get_market_snapshot` | — |
| Create task / calendar event | ✅ | — |
| **Run any of ~59 Realtor AI skills** | ✅ `run_skill` | `/dashboard/skills` |
| Answer: "how's my pipeline / what's at risk / what did I make" | ✅ `get_pipeline` · `get_deals` · `get_financials` | summary/perf/tx/books APIs |
| On-demand daily briefing | 🔴 | `briefings` |
| Change branding / voice / settings | ⛔ / 🔴 | `/dashboard/settings` |
| Billing / plan changes | ⛔ | `/dashboard/billing` |
| Digital-twin recording / voice-clone consent | ⛔ (identity/consent) | avatar studio setup |

---

## Recommended plan (most leverage first)

### Phase 1 — Restore parity: bridge the action registry into the loop ✅ DONE
Wrap capabilities that **already exist** in `lib/closeboss/actions/registry.ts` as `BossTool`s. Lowest effort, biggest jump.

1. ✅ **`run_skill`** (#1113) — unlocks the **~59-skill** catalog (listing descriptions, farm/expired/FSBO scripts, objection scripts, GCI plan, net sheets, newsletters, case studies, video scripts…). Single highest-value addition. Wraps `routeSkillRequest` + `runSkillAndSave`.
2. ✅ **`setup_open_house`** (#1114) — playbook (pricing CMA + dated checklist).
3. ✅ **`coordinate_closing`** (#1114) — deadline timeline from the closing date.
4. ✅ **`start_selling_playbook`** / **`start_buying_playbook`** (#1114) — stateful engagements.
5. ✅ **Saved buyer search** — already reachable: `house_search` accepts `contact_id` + `auto_run_frequency`. No new tool.
6. ✅ **Cold-call & qualify** — already reachable by composition: `query_crm` → `schedule_voice_call`. **`schedule_showing`** is composable via `create_task`; add a dedicated tool only if usage warrants.

### Phase 2 — "Ask Max anything": read tools (low risk, read-only) — ✅ DONE
Today Max can *do* but barely *answer*. A captain you can question is the charter test.
- ✅ `get_pipeline` (leads hot/warm/cold + cooling), ✅ `get_deals` (transactions + deadlines + risk), ✅ `get_financials` (commission pipeline, closed YTD, next payout, expenses) — #1115.
- ✅ `get_calendar` (today/week appointments), ✅ `get_sphere_signals` (buying/selling signals + next move), ✅ `get_performance` (leads + active deals + closed-YTD throughput) — #1117.
- "Which deals are at risk?", "what did I make this month?", "who's likely to sell?", "what's on my calendar?" are all answerable in-chat.

### Phase 3 — Per-employee write tools (agentize the pure-UI 🔴 rows)
Prioritize by daily use:
- **Ruby:** newsletter (generate+send), listing→ad-reel/video, marketing plan, postcards, flyer, weekly-schedule setup.
- **Grace:** create/update transaction, deal tasks, contract review, compare offers + net sheet, deal-coach summary.
- **Oliver:** log expense, create/send invoice.
- **Chris:** sphere outreach (likely buyer/seller), smart-list segment, lead pipeline plan, suggested properties.
- **Emma:** bulk calls, appointment reminders, missed-call status.

### Guardrails — what stays human (⛔)
Max **manages and does the work**, but never performs: OAuth/social-account connect, billing/plan changes, commission/financial config, digital-twin recording + voice-clone consent, destructive deletes, legally-binding submissions. For these Max **explains and links to the UI** — consistent with the platform safety rails.

---

## Definition of done
Ask Max "supports the full app" when, for every ✅/🟡/🔴 row above, either (a) a `BossTool` exists, or (b) it's an explicit ⛔ that Max hands off with a link. Track completion by diffing this map against `ALL_TOOLS`.
