-- Security: enable Row Level Security on the 121 public tables that had it
-- disabled, closing the hole where anyone with the (public) anon key could
-- read/write every row. The Supabase project is shared by three apps
-- (leadsmartai, propertytoolsai, leadsmart-mobile); all three were audited for
-- anon/session-client (RLS-subject) table access before this change.
--
-- The vast majority of these tables are only ever accessed server-side via the
-- service-role client (which bypasses RLS), so enabling RLS with no policy is
-- transparent — same pattern already used by public.contacts. Three tables ARE
-- reached by an anon/session client; only propertytools_users gets a scoped
-- policy below (it has a real client-side writer — the signup upsert).
--
-- property_reports and nurture_alerts are also reached by a session client but
-- have no *working* reader to protect: property_reports has 0 rows and its
-- readers select columns that don't exist on the table, and the nurture_alerts
-- reader short-circuits on the contacts deny-all before it runs. Both are read
-- elsewhere only via the service-role client, so RLS-with-no-policy is safe. A
-- correct policy can be added when a real reader is built (note the drifted
-- types: nurture_alerts.agent_id is uuid vs agents.id bigint;
-- property_reports.created_by_user_id is bigint, not an auth uuid).
--
-- spatial_ref_sys is intentionally excluded: it's a PostGIS system catalog
-- owned by supabase_admin (not ours to alter, and not app data).

alter table public.activities enable row level security;
alter table public.affordability_sessions enable row level security;
alter table public.agent_ai_settings enable row level security;
alter table public.agent_commission_prefs enable row level security;
alter table public.agent_inbound_aliases enable row level security;
alter table public.agent_message_settings enable row level security;
alter table public.agent_notifications enable row level security;
alter table public.agent_voice_settings enable row level security;
alter table public.ai_cache enable row level security;
alter table public.ai_usage enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.city_market_data enable row level security;
alter table public.cma_daily_usage enable row level security;
alter table public.comparable_sales enable row level security;
alter table public.comparison_reports enable row level security;
alter table public.contact_import_jobs enable row level security;
alter table public.contact_import_rows enable row level security;
alter table public.contact_saved_searches enable row level security;
alter table public.crm_pipeline_stages enable row level security;
alter table public.daily_briefings enable row level security;
alter table public.deals enable row level security;
alter table public.greeting_automation_settings enable row level security;
alter table public.growth_digest_log enable row level security;
alter table public.growth_opportunities_cache enable row level security;
alter table public.home_value_reports enable row level security;
alter table public.inbound_email_deliveries enable row level security;
alter table public.lead_activity_events enable row level security;
alter table public.lead_ad_campaigns enable row level security;
alter table public.lead_call_events enable row level security;
alter table public.lead_calls enable row level security;
alter table public.lead_conversions enable row level security;
alter table public.lead_followups enable row level security;
alter table public.lead_posts enable row level security;
alter table public.lead_pricing_predictions enable row level security;
alter table public.lead_pricing_weights enable row level security;
alter table public.lead_sequences enable row level security;
alter table public.lead_tasks enable row level security;
alter table public.leadsmart_funnel_events enable row level security;
alter table public.leadsmart_funnel_state enable row level security;
alter table public.listing_feedback enable row level security;
alter table public.listing_offer_counters enable row level security;
alter table public.listing_offers enable row level security;
alter table public.listings enable row level security;
alter table public.loan_applications enable row level security;
alter table public.market_stats enable row level security;
alter table public.media_library enable row level security;
alter table public.message_logs enable row level security;
alter table public.message_templates enable row level security;
alter table public.meta_webhook_events enable row level security;
alter table public.mobile_push_tokens enable row level security;
alter table public.notifications enable row level security;
alter table public.nurture_alerts enable row level security;
alter table public.offer_counters enable row level security;
alter table public.offer_expiration_alert_log enable row level security;
alter table public.offers enable row level security;
alter table public.open_house_visitors enable row level security;
alter table public.open_houses enable row level security;
alter table public.opportunities enable row level security;
alter table public.playbook_task_instances enable row level security;
alter table public.postcard_sends enable row level security;
alter table public.presentations enable row level security;
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.properties_cache enable row level security;
alter table public.properties_dw enable row level security;
alter table public.property_cache enable row level security;
alter table public.property_comps_dw enable row level security;
alter table public.property_listings enable row level security;
alter table public.property_reports enable row level security;
alter table public.property_sales enable row level security;
alter table public.property_snapshots_dw enable row level security;
alter table public.propertytools_users enable row level security;
alter table public.public_events enable row level security;
alter table public.recurring_post_schedules enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_events enable row level security;
alter table public.reports enable row level security;
alter table public.scheduled_posts enable row level security;
alter table public.seller_leads enable row level security;
alter table public.seo_cluster_generation_runs enable row level security;
alter table public.seo_cluster_pages enable row level security;
alter table public.seo_cluster_topics enable row level security;
alter table public.seo_competitor_analysis_runs enable row level security;
alter table public.seo_competitor_keywords enable row level security;
alter table public.seo_competitor_pages enable row level security;
alter table public.seo_content_overrides enable row level security;
alter table public.seo_keyword_candidates enable row level security;
alter table public.seo_keyword_discovery_runs enable row level security;
alter table public.seo_keyword_opportunities enable row level security;
alter table public.seo_optimization_runs enable row level security;
alter table public.seo_page_performance enable row level security;
alter table public.seo_title_ab_variants enable row level security;
alter table public.sequence_steps enable row level security;
alter table public.serp_dominator_campaigns enable row level security;
alter table public.serp_dominator_pages enable row level security;
alter table public.serp_rank_snapshots enable row level security;
alter table public.shareable_results enable row level security;
alter table public.showing_feedback enable row level security;
alter table public.showings enable row level security;
alter table public.social_accounts enable row level security;
alter table public.subscription_events enable row level security;
alter table public.subscriptions enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
alter table public.tasks enable row level security;
alter table public.template_overrides enable row level security;
alter table public.tool_usage_logs enable row level security;
alter table public.traffic_events enable row level security;
alter table public.transaction_counterparties enable row level security;
alter table public.transaction_nudge_log enable row level security;
alter table public.transaction_reviews enable row level security;
alter table public.transaction_tasks enable row level security;
alter table public.transaction_wire_alert_log enable row level security;
alter table public.transactions enable row level security;
alter table public.usage_events enable row level security;
alter table public.usage_logs enable row level security;
alter table public.users enable row level security;
alter table public.valuation_calibration_history enable row level security;
alter table public.valuation_calibration_profiles enable row level security;
alter table public.valuation_runs enable row level security;
alter table public.valuation_training_exports enable row level security;

-- ── Scoped policy for the one anon/session-WRITTEN table ────────────────────

-- propertytools_users: client-side signup upsert. Mirrors the existing
-- user_profiles / leadsmart_users self-row policies.
drop policy if exists users_manage_own_propertytools_row on public.propertytools_users;
create policy users_manage_own_propertytools_row on public.propertytools_users
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
