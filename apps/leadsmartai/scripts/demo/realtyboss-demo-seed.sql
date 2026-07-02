-- RealtyBoss demo seed — paints the sandboxed demo account
-- (michael.yes@mail.com) as a working Realtor with an active AI team.
--
-- Idempotent: RESETS all CRM rows for that agent, then inserts a
-- coherent story with deterministic ids (0bde….) and now()-relative
-- timestamps, so re-running always yields a fresh "today".
--
-- Run against the LeadSmart Supabase project (babmbowmzwizoahkmshx),
-- e.g. via the Supabase MCP execute_sql or psql as service role.
--
-- The story:
--   • 12 contacts — 3 hot (Jane Chen pre-approved buyer, Maria Lopez
--     seller wanting a valuation, Grace Liu captured by the AI
--     Receptionist this morning), warm follow-ups, quiet leads for
--     reactivation, and 3 active clients tied to transactions.
--   • 3 active transactions — inspection deadline in 2 days, appraisal
--     in 6, and a closing in 2 days with wire verification still open
--     (drives the wire-fraud alert + "at risk" surfaces).
--   • Tasks (3 overdue), today's appointments, call logs (answered /
--     missed-recovered / outbound), an SMS Auto Pilot thread, and a
--     week of assistant_activities so the AI-team feed + 14-day
--     performance chart read as a living team.
--   • boss_recommendations are NOT seeded — the engine syncs them
--     from this data on the first dashboard load.

do $$
declare
  v_agent bigint;
  -- contacts
  c_jane    uuid := '0bde0001-0000-4000-8000-000000000001';
  c_maria   uuid := '0bde0001-0000-4000-8000-000000000002';
  c_david   uuid := '0bde0001-0000-4000-8000-000000000003';
  c_beckers uuid := '0bde0001-0000-4000-8000-000000000004';
  c_linda   uuid := '0bde0001-0000-4000-8000-000000000005';
  c_kevin   uuid := '0bde0001-0000-4000-8000-000000000006';
  c_priya   uuid := '0bde0001-0000-4000-8000-000000000007';
  c_marcus  uuid := '0bde0001-0000-4000-8000-000000000008';
  c_emily   uuid := '0bde0001-0000-4000-8000-000000000009';
  c_castillo uuid := '0bde0001-0000-4000-8000-000000000010';
  c_daniel  uuid := '0bde0001-0000-4000-8000-000000000011';
  c_grace   uuid := '0bde0001-0000-4000-8000-000000000012';
  c_tony    uuid := '0bde0001-0000-4000-8000-000000000013'; -- sphere (personal)
  -- transactions
  t_cherry  uuid := '0bde0002-0000-4000-8000-000000000001';
  t_maple   uuid := '0bde0002-0000-4000-8000-000000000002';
  t_birch   uuid := '0bde0002-0000-4000-8000-000000000003';
begin
  select ag.id into v_agent
  from public.agents ag
  join auth.users u on u.id = ag.auth_user_id
  where lower(u.email) = 'michael.yes@mail.com'
  limit 1;
  if v_agent is null then
    raise exception 'Demo agent (michael.yes@mail.com) not found';
  end if;

  -- ── Reset the sandbox ────────────────────────────────────────────
  -- Cached AI briefings reference old data — clear so they regenerate.
  delete from public.daily_briefings where agent_id = v_agent;
  delete from public.agent_inbox_notifications where agent_id = v_agent;
  delete from public.boss_recommendations where agent_id = v_agent;
  delete from public.assistant_activities where agent_id = v_agent;
  delete from public.sms_messages where agent_id = v_agent;
  delete from public.receptionist_callbacks where agent_id = v_agent;
  delete from public.call_logs where agent_id = v_agent;
  delete from public.voice_appointments where agent_id = v_agent;
  delete from public.lead_calendar_events where agent_id = v_agent;
  delete from public.transaction_tasks where transaction_id in (select id from public.transactions where agent_id = v_agent);
  delete from public.transactions where agent_id = v_agent;
  delete from public.crm_tasks where agent_id = v_agent;
  delete from public.invoice_lines where invoice_id in (select id from public.invoices where agent_id = v_agent);
  delete from public.invoices where agent_id = v_agent;
  delete from public.expenses where agent_id = v_agent;
  begin
    delete from public.contacts where agent_id = v_agent;
  exception when others then
    -- FK from some side table — archive instead so old test rows
    -- don't pollute the demo lists.
    update public.contacts
       set rating = 'cold', lifecycle_stage = 'archived', engagement_score = 0
     where agent_id = v_agent;
  end;

  -- ── Contacts ─────────────────────────────────────────────────────
  insert into public.contacts
    (id, agent_id, lifecycle_stage, name, first_name, last_name, email, phone, source, rating,
     engagement_score, intent, buying_or_selling, timeline, search_location, price_min, price_max,
     property_address, last_activity_at, last_contacted_at, sms_opt_in, auto_pilot, notes, created_at)
  values
    (c_jane, v_agent, 'lead', 'Jane Chen', 'Jane', 'Chen', 'jane.chen@example.com', '+16265550141',
     'Zillow', 'hot', 92, 'Pre-approved buyer, wants to tour this weekend', 'buying', '0-3 months',
     'Pasadena, CA', 800000, 1100000, null,
     now() - interval '2 hours', now() - interval '5 hours', true, true,
     'Pre-approved with Chase ($1.05M). Two kids, wants Madison Elementary district. AI Sales Assistant qualified her on 6/9.',
     now() - interval '6 days'),
    (c_maria, v_agent, 'lead', 'Maria Lopez', 'Maria', 'Lopez', 'maria.lopez@example.com', '+18185550162',
     'Home valuation tool', 'hot', 88, 'Seller — requested valuation of 4521 Rosewood Dr', 'selling', '0-3 months',
     null, null, null, '4521 Rosewood Dr, Arcadia, CA',
     now() - interval '5 hours', now() - interval '1 day', true, false,
     'Ran the home-value tool twice. Relocating for work in September; wants a listing consult.',
     now() - interval '4 days'),
    (c_david, v_agent, 'lead', 'David Wang', 'David', 'Wang', 'david.wang@example.com', '+16265550178',
     'Market report', 'warm', 74, 'Opened the Arcadia market report 3 times', 'buying', '3-6 months',
     'Arcadia, CA', 700000, 950000, null,
     now() - interval '1 day', now() - interval '2 days', true, false,
     'Engaged with every market-report email. Likely move-up buyer; current condo on Huntington Dr.',
     now() - interval '12 days'),
    (c_beckers, v_agent, 'lead', 'Sarah & Tom Becker', 'Sarah', 'Becker', 'beckers@example.com', '+16265550112',
     'Open house', 'warm', 66, 'Toured 312 Alder St open house, asked about schools', 'buying', '3-6 months',
     'Monrovia, CA', 650000, 850000, null,
     now() - interval '2 days', now() - interval '2 days', true, false,
     'Signed in at the 312 Alder St open house. First-time buyers, not pre-approved yet.',
     now() - interval '9 days'),
    (c_linda, v_agent, 'lead', 'Linda Park', 'Linda', 'Park', 'linda.park@example.com', '+18185550190',
     'Referral', 'warm', 61, 'Thinking of selling next spring', 'selling', '6-12 months',
     null, null, null, '922 N Sierra Bonita Ave, Pasadena, CA',
     now() - interval '3 days', now() - interval '3 days', false, false,
     'Referred by the Castillos. Wants to know what spring inventory looks like before committing.',
     now() - interval '20 days'),
    (c_kevin, v_agent, 'lead', E'Kevin O’Brien', 'Kevin', E'O’Brien', 'kevin.obrien@example.com', '+13235550133',
     'Facebook ad', 'cold', 35, null, 'buying', '12+ months',
     'Glendale, CA', 500000, 700000, null,
     now() - interval '12 days', now() - interval '12 days', true, false,
     'Clicked the “What can $600k buy” ad in May. Went quiet after two exchanges.',
     now() - interval '45 days'),
    (c_priya, v_agent, 'lead', 'Priya Natarajan', 'Priya', 'Natarajan', 'priya.n@example.com', '+16265550155',
     'IDX search', 'cold', 28, null, 'buying', null,
     'San Marino, CA', 1200000, 1800000, null,
     now() - interval '15 days', null, false, false, null,
     now() - interval '60 days'),
    (c_marcus, v_agent, 'lead', 'Marcus Reed', 'Marcus', 'Reed', 'marcus.reed@example.com', '+12135550177',
     'Website', 'cold', 22, 'Renter exploring first purchase', 'buying', '12+ months',
     'Alhambra, CA', 450000, 600000, null,
     now() - interval '21 days', now() - interval '21 days', true, false, null,
     now() - interval '75 days'),
    (c_emily, v_agent, 'active_client', 'Emily Tran', 'Emily', 'Tran', 'emily.tran@example.com', '+16265550106',
     'Referral', 'warm', 81, 'Under contract — 148 W Cherry Ave', 'buying', '0-3 months',
     'Monrovia, CA', null, null, '148 W Cherry Ave, Monrovia, CA',
     now() - interval '6 hours', now() - interval '6 hours', true, false,
     'In escrow on 148 W Cherry Ave. Inspection this week.',
     now() - interval '30 days'),
    (c_castillo, v_agent, 'active_client', 'Robert & Joan Castillo', 'Robert', 'Castillo', 'castillos@example.com', '+18185550120',
     'Past client', 'warm', 77, 'Selling 87 Birchwood Ln — closing this week', 'selling', '0-3 months',
     null, null, null, '87 Birchwood Ln, Pasadena, CA',
     now() - interval '10 hours', now() - interval '10 hours', true, false,
     'Closing Friday. Wire instructions still need verbal verification with escrow.',
     now() - interval '55 days'),
    (c_daniel, v_agent, 'active_client', 'Daniel Kim', 'Daniel', 'Kim', 'daniel.kim@example.com', '+12135550148',
     'Sphere', 'warm', 72, 'Under contract — 2204 Maple Ct', 'buying', '0-3 months',
     'Pasadena, CA', null, null, '2204 Maple Ct, Pasadena, CA',
     now() - interval '1 day', now() - interval '1 day', true, false,
     'Appraisal due next week. Lender is Pacific Western.',
     now() - interval '40 days'),
    (c_grace, v_agent, 'lead', 'Grace Liu', 'Grace', 'Liu', 'grace.liu@example.com', '+16265550199',
     'AI Receptionist', 'hot', 84, 'Relocating from Seattle, wants downtown condos', 'buying', '0-3 months',
     'Pasadena, CA', 600000, 800000, null,
     now() - interval '3 hours', now() - interval '3 hours', true, false,
     'Called this morning; the AI Receptionist captured her details and she asked for condo tours next week. Cash budget ~$750k.',
     now() - interval '3 hours'),
    (c_tony, v_agent, 'sphere', 'Tony Russo', 'Tony', 'Russo', 'tony.russo@example.com', '+16265550700',
     'Sphere', 'warm', 40, null, null, null,
     null, null, null, null,
     now() - interval '2 hours', now() - interval '30 days', false, false,
     'College roommate — golf buddy. Personal contact, not a client.',
     now() - interval '2 years');

  -- ── Tasks (3 overdue, 2 today, 2 upcoming) ───────────────────────
  insert into public.crm_tasks (agent_id, contact_id, title, description, due_at, status, priority, source, created_at) values
    (v_agent, c_jane,  'Send updated showing list to Jane Chen', 'She asked for weekend tours — include 312 Alder St.', now() - interval '1 day', 'open', 'high', 'ai_call', now() - interval '2 days'),
    (v_agent, c_maria, 'Email CMA to Maria Lopez', '4521 Rosewood Dr — she ran the valuation tool twice.', now() - interval '2 days', 'open', 'urgent', 'manual', now() - interval '3 days'),
    (v_agent, c_david, 'Follow up with David Wang about the market report', 'Opened it 3 times — call about move-up options.', now() - interval '1 day', 'open', 'normal', 'automation', now() - interval '2 days'),
    (v_agent, c_emily, 'Confirm inspector access — 148 W Cherry Ave', 'Inspection contingency expires in 2 days.', now() + interval '4 hours', 'open', 'high', 'manual', now() - interval '1 day'),
    (v_agent, c_daniel, 'Call lender re: Daniel Kim rate lock', 'Pacific Western — lock expires before closing.', now() + interval '6 hours', 'open', 'normal', 'manual', now() - interval '1 day'),
    (v_agent, c_linda, 'Prep listing presentation for Linda Park', null, now() + interval '2 days', 'open', 'normal', 'manual', now() - interval '1 day'),
    (v_agent, c_maria, 'Schedule photographer — 4521 Rosewood Dr', 'Pending listing agreement.', now() + interval '3 days', 'open', 'low', 'manual', now() - interval '1 day');

  -- ── Today's appointments ─────────────────────────────────────────
  insert into public.lead_calendar_events (agent_id, contact_id, title, description, starts_at, ends_at, status, created_at) values
    (v_agent, c_jane, 'Buyer consultation — Jane Chen', 'Booked by the AI Sales Assistant. Review tour list + lender letter.', date_trunc('day', now()) + interval '20 hours', date_trunc('day', now()) + interval '21 hours', 'scheduled', now() - interval '1 day'),
    (v_agent, c_beckers, 'Showing — 312 Alder St with Sarah & Tom Becker', null, date_trunc('day', now()) + interval '22 hours 30 minutes', date_trunc('day', now()) + interval '23 hours 30 minutes', 'scheduled', now() - interval '2 days'),
    (v_agent, c_maria, 'Listing presentation — Maria Lopez', '4521 Rosewood Dr. Bring CMA + net sheet.', date_trunc('day', now()) + interval '1 day 17 hours', date_trunc('day', now()) + interval '1 day 18 hours', 'scheduled', now() - interval '5 hours'),
    (v_agent, c_emily, 'Inspection — 148 W Cherry Ave', 'Meet Emily + inspector on site.', date_trunc('day', now()) + interval '2 days 16 hours', date_trunc('day', now()) + interval '2 days 19 hours', 'scheduled', now() - interval '1 day');

  -- ── Transactions ─────────────────────────────────────────────────
  insert into public.transactions
    (id, agent_id, contact_id, transaction_type, property_address, city, state, purchase_price, status,
     mutual_acceptance_date, inspection_deadline, inspection_completed_at, appraisal_deadline, appraisal_completed_at,
     loan_contingency_deadline, loan_contingency_removed_at, closing_date,
     commission_pct, gross_commission, brokerage_split_pct, referral_fee_pct, agent_net_commission)
  values
    (t_cherry, v_agent, c_emily, 'buyer_rep', '148 W Cherry Ave', 'Monrovia', 'CA', 935000, 'active',
     (now() - interval '8 days')::date, (now() + interval '2 days')::date, null, (now() + interval '9 days')::date, null,
     (now() + interval '16 days')::date, null, (now() + interval '32 days')::date,
     2.5, 23375, 70, 0, 16362.50),
    (t_maple, v_agent, c_daniel, 'buyer_rep', '2204 Maple Ct', 'Pasadena', 'CA', 612000, 'active',
     (now() - interval '15 days')::date, (now() - interval '5 days')::date, now() - interval '5 days', (now() + interval '6 days')::date, null,
     (now() + interval '13 days')::date, null, (now() + interval '27 days')::date,
     2.5, 15300, 70, 0, 10710),
    (t_birch, v_agent, c_castillo, 'listing_rep', '87 Birchwood Ln', 'Pasadena', 'CA', 745000, 'active',
     (now() - interval '28 days')::date, (now() - interval '20 days')::date, now() - interval '20 days', (now() - interval '12 days')::date, now() - interval '12 days',
     (now() - interval '5 days')::date, now() - interval '5 days', (now() + interval '2 days')::date,
     3.0, 22350, 70, 0, 15645);

  insert into public.transaction_tasks (transaction_id, stage, title, description, due_date, completed_at, order_index, seed_key, source) values
    (t_cherry, 'inspection', 'Schedule home inspection', null, (now() - interval '2 days')::date, now() - interval '3 days', 1, 'schedule_inspection', 'seed'),
    (t_cherry, 'inspection', 'Review inspection report with Emily', 'Contingency expires — decide repairs vs credits.', (now() + interval '2 days')::date, null, 2, 'review_inspection', 'seed'),
    (t_cherry, 'appraisal', 'Confirm appraisal ordered', null, (now() + interval '5 days')::date, null, 3, 'order_appraisal', 'seed'),
    (t_cherry, 'closing', 'Verify wire instructions with escrow', null, (now() + interval '30 days')::date, null, 9, 'verify_wire_instructions', 'seed'),
    (t_maple, 'appraisal', 'Chase appraiser for report', 'Lender says scheduled Thursday.', (now() + interval '6 days')::date, null, 1, 'review_appraisal', 'seed'),
    (t_maple, 'loan', 'Confirm loan conditions cleared', null, (now() + interval '12 days')::date, null, 2, 'loan_conditions', 'seed'),
    (t_birch, 'closing', 'Verify wire instructions with escrow', 'CALL First American on the known number — never trust emailed changes.', (now() + interval '1 day')::date, null, 1, 'verify_wire_instructions', 'seed'),
    (t_birch, 'closing', 'Collect signed closing disclosures', null, (now() - interval '1 day')::date, null, 2, 'closing_disclosures', 'seed'),
    (t_birch, 'closing', 'Schedule final walkthrough', null, (now() + interval '1 day')::date, null, 3, 'final_walkthrough', 'seed');

  -- ── Text-back message bodies (linked from call_logs below) ───────
  insert into public.message_logs (id, contact_id, type, status, content, created_at) values
    ('0bde0003-0000-4000-8000-000000000001', 'demo-caller-3105550466', 'sms', 'sent',
     'Hey there — Michael here. Sorry I missed your call. What''s the best way I can help? Happy to text or set up a quick call back.', now() - interval '7 hours'),
    ('0bde0003-0000-4000-8000-000000000002', 'demo-caller-8185550771', 'sms', 'sent',
     'Hey there — Michael here. Sorry I missed your call. What''s the best way I can help? Happy to text or set up a quick call back.', now() - interval '2 days 6 hours'),
    ('0bde0003-0000-4000-8000-000000000003', 'demo-caller-6265550633', 'sms', 'sent',
     'Hey there — Michael here. Sorry I missed your call. What''s the best way I can help? Happy to text or set up a quick call back.', now() - interval '35 minutes')
  on conflict (id) do update set created_at = excluded.created_at, status = excluded.status;

  -- ── Call logs (answered / missed-recovered / call-backs / personal) ──
  insert into public.call_logs (agent_id, contact_id, direction, status, from_phone, to_phone, duration_seconds, textback_message_log_id, notes, created_at) values
    -- A fresh miss: text-back sent, call-back ladder running (attempt 1 placed, attempt 2 pending).
    (v_agent, null, 'inbound', 'missed', '+16265550633', '+18778017240', null, '0bde0003-0000-4000-8000-000000000003', 'Auto text-back sent.', now() - interval '35 minutes'),
    (v_agent, null, 'outbound', 'no_answer', '+18778017240', '+16265550633', 0, null, 'Automatic call-back (attempt 1 of 3) for a missed call.', now() - interval '30 minutes'),
    -- A personal call: sphere contact, reminder sent to the Realtor instead of lead capture.
    (v_agent, c_tony, 'inbound', 'missed', '+16265550700', '+18778017240', null, null, 'Personal call — reminder sent to you.', now() - interval '2 hours'),
    (v_agent, c_grace, 'inbound', 'completed', '+16265550199', '+18778017240', 263, null, 'AI call summary: Grace Liu is relocating from Seattle, cash budget around $750k, wants downtown Pasadena condo tours next week. Captured contact details and requested follow-up.', now() - interval '3 hours'),
    (v_agent, null, 'inbound', 'completed', '+16265550802', '+18778017240', 142, null, 'AI call summary: Caller asked about this weekend''s open house times for 312 Alder St; provided schedule and offered a private showing.', now() - interval '5 hours'),
    -- Recovered by call-back: missed at -7h, reached on the second attempt.
    (v_agent, null, 'inbound', 'missed', '+13105550466', '+18778017240', null, '0bde0003-0000-4000-8000-000000000001', 'Auto text-back sent.', now() - interval '7 hours'),
    (v_agent, null, 'outbound', 'no_answer', '+18778017240', '+13105550466', 0, null, 'Automatic call-back (attempt 1 of 3) for a missed call.', now() - interval '6 hours 55 minutes'),
    (v_agent, null, 'outbound', 'completed', '+18778017240', '+13105550466', 158, null, 'AI call summary: Returned the missed call — caller wanted rental info for a Pasadena duplex; took details and promised the Realtor would follow up.', now() - interval '6 hours 50 minutes'),
    (v_agent, c_jane, 'inbound', 'completed', '+16265550141', '+18778017240', 318, null, 'AI call summary: Jane Chen confirmed she is pre-approved and asked to tour 312 Alder St and two comparables this weekend. Appointment request handed to the Realtor.', now() - interval '1 day 2 hours'),
    (v_agent, c_maria, 'inbound', 'completed', '+18185550162', '+18185550100', 204, null, 'AI call summary: Maria Lopez asked what her Rosewood Dr home could list for; booked a listing presentation for tomorrow morning.', now() - interval '1 day 4 hours'),
    -- Exhausted ladder: missed yesterday, three call-backs unanswered — needs the Realtor.
    (v_agent, null, 'inbound', 'missed', '+16265550913', '+18778017240', null, null, 'Missed; text-back send failed.', now() - interval '1 day 6 hours'),
    (v_agent, null, 'outbound', 'no_answer', '+18778017240', '+16265550913', 0, null, 'Automatic call-back (attempt 3 of 3) for a missed call.', now() - interval '1 day 5 hours 30 minutes'),
    (v_agent, c_kevin, 'outbound', 'completed', '+18778017240', '+13235550133', 95, null, 'AI call summary: Reactivation call to Kevin O''Brien — still interested but waiting on a promotion decision in August. Asked to check back mid-July.', now() - interval '1 day 8 hours'),
    (v_agent, c_beckers, 'inbound', 'completed', '+16265550112', '+18778017240', 187, null, 'AI call summary: Sarah Becker asked about Madison Elementary boundaries for 312 Alder St; scheduled a second showing.', now() - interval '2 days 3 hours'),
    (v_agent, null, 'inbound', 'missed', '+18185550771', '+18778017240', null, '0bde0003-0000-4000-8000-000000000002', 'Auto text-back sent.', now() - interval '2 days 6 hours');

  -- ── Call-back ladders (one per missed caller above) ──────────────
  insert into public.receptionist_callbacks (agent_id, contact_id, phone_e164, attempts, next_attempt_at, status, created_at, updated_at) values
    -- Running: attempt 1 placed, attempt 2 due shortly.
    (v_agent, null, '+16265550633', 1, now() + interval '4 minutes', 'scheduled', now() - interval '35 minutes', now() - interval '30 minutes'),
    -- Recovered on the second attempt.
    (v_agent, null, '+13105550466', 2, null, 'answered', now() - interval '7 hours', now() - interval '6 hours 50 minutes'),
    -- Exhausted — three attempts, no answer.
    (v_agent, null, '+16265550913', 3, null, 'exhausted', now() - interval '1 day 6 hours', now() - interval '1 day 5 hours 30 minutes');

  -- ── Appointment booked on a call (Grace's condo tour) ────────────
  insert into public.voice_appointments (agent_id, contact_id, caller_name, caller_phone, title, start_at, end_at, status, source, created_at) values
    (v_agent, c_grace::text, 'Grace Liu', '+16265550199', 'Buyer consultation — Grace Liu', date_trunc('day', now()) + interval '3 days 18 hours', date_trunc('day', now()) + interval '3 days 18 hours 30 minutes', 'booked', 'ai_receptionist', now() - interval '2 hours 55 minutes');

  -- ── SMS threads ──────────────────────────────────────────────────
  insert into public.sms_messages (agent_id, contact_id, message, direction, twilio_status, created_at) values
    (v_agent, c_jane, 'Hi! Is 312 Alder St still available? We''d love to see it Saturday.', 'inbound', null, now() - interval '1 day 1 hour'),
    (v_agent, c_jane, 'Hi Jane! Yes, 312 Alder St is active. Saturday works — would 11am or 2pm suit you better? I''ll also pull two similar homes nearby worth seeing the same trip.', 'outbound', 'delivered', now() - interval '1 day 1 hour' + interval '2 minutes'),
    (v_agent, c_jane, '11am is perfect. Can you send the other two addresses?', 'inbound', null, now() - interval '4 hours'),
    (v_agent, c_jane, 'Booked for 11am Saturday! The other two: 415 Heliotrope Ave and 28 Greenfield Ct — both in the Madison Elementary zone. Michael will confirm the full route at your consultation today.', 'outbound', 'delivered', now() - interval '4 hours' + interval '90 seconds'),
    (v_agent, c_kevin, 'Hi Kevin, it''s Michael''s assistant at RealtyBoss. We spoke in May about homes around Glendale — are you still thinking about a move this year? No rush either way, happy to send what $600k buys right now.', 'outbound', 'delivered', now() - interval '3 days');

  -- ── A week of AI-team activity ───────────────────────────────────
  insert into public.assistant_activities (agent_id, assistant_type, activity_type, summary, outcome, priority, requires_attention, related_entity_type, related_entity_id, created_at) values
    -- today
    (v_agent, 'receptionist', 'inbound_call_answered', 'Answered a call from Grace Liu (+16265550199)', 'Relocating from Seattle, ~$750k cash, wants downtown condo tours next week — new lead created', 'high', true, 'contact', c_grace::text, now() - interval '3 hours'),
    (v_agent, 'sales_assistant', 'sms_auto_reply', 'Replied to Jane Chen via SMS (Auto Pilot)', 'Confirmed Saturday 11am showing + sent two comparable addresses', 'normal', false, 'contact', c_jane::text, now() - interval '4 hours'),
    (v_agent, 'receptionist', 'inbound_call_answered', 'Answered a call about 312 Alder St open house times', 'Provided schedule, offered a private showing', 'normal', false, null, null, now() - interval '5 hours'),
    (v_agent, 'transaction_assistant', 'wire_fraud_alert', 'Texted you a wire-fraud reminder for 87 Birchwood Ln (closes in 2 days, wire instructions unverified)', 'Alert sent', 'high', true, 'transaction', t_birch::text, now() - interval '6 hours'),
    (v_agent, 'receptionist', 'missed_call_textback', 'Texted back a missed call from (626) 555-0633', 'Text-back sent — call-backs scheduled', 'normal', false, null, null, now() - interval '35 minutes'),
    (v_agent, 'receptionist', 'missed_call_callback', 'Called (626) 555-0633 back (attempt 1 of 3)', 'No answer — will retry', 'normal', false, null, null, now() - interval '30 minutes'),
    (v_agent, 'receptionist', 'personal_call_reminder', 'Reminded you to call Tony Russo back — personal call', 'Reminder in your inbox', 'normal', false, 'contact', c_tony::text, now() - interval '2 hours'),
    (v_agent, 'receptionist', 'missed_call_textback', 'Texted back a missed call from +13105550466', 'Text-back sent', 'normal', false, null, null, now() - interval '7 hours'),
    (v_agent, 'receptionist', 'missed_call_callback', 'Called (310) 555-0466 back (attempt 2 of 3)', 'Reached — rental inquiry, details captured', 'normal', false, null, null, now() - interval '6 hours 50 minutes'),
    (v_agent, 'transaction_assistant', 'transaction_digest', 'Emailed your transaction digest: 1 overdue, 5 upcoming tasks', 'Digest sent', 'high', true, null, null, now() - interval '9 hours'),
    -- yesterday
    (v_agent, 'sales_assistant', 'hot_lead_flagged', 'Flagged Jane Chen as hot — pre-approved and requesting weekend tours', 'Recommended priority follow-up', 'high', true, 'contact', c_jane::text, now() - interval '1 day 2 hours'),
    (v_agent, 'receptionist', 'inbound_call_answered', 'Answered a call from Jane Chen', 'Pre-approved buyer; wants to tour 312 Alder St + comparables this weekend', 'normal', false, 'contact', c_jane::text, now() - interval '1 day 2 hours'),
    (v_agent, 'receptionist', 'appointment_booked', 'Booked a listing presentation with Maria Lopez', 'Tomorrow 10:00 AM — 4521 Rosewood Dr', 'normal', false, 'contact', c_maria::text, now() - interval '1 day 4 hours'),
    (v_agent, 'sales_assistant', 'outbound_ai_call', 'Placed a reactivation call to Kevin O''Brien', 'Connected — revisit mid-July after his promotion decision', 'normal', false, 'contact', c_kevin::text, now() - interval '1 day 8 hours'),
    (v_agent, 'transaction_assistant', 'transaction_digest', 'Emailed your transaction digest: 0 overdue, 6 upcoming tasks', 'Digest sent', 'normal', false, null, null, now() - interval '1 day 9 hours'),
    -- earlier this week
    (v_agent, 'receptionist', 'inbound_call_answered', 'Answered a call from Sarah Becker', 'School-boundary questions on 312 Alder St; second showing scheduled', 'normal', false, 'contact', c_beckers::text, now() - interval '2 days 3 hours'),
    (v_agent, 'receptionist', 'missed_call_textback', 'Texted back a missed call from +18185550771', 'Text-back sent', 'normal', false, null, null, now() - interval '2 days 6 hours'),
    -- Marketing Assistant (demand generation — took this over from Sales)
    (v_agent, 'marketing_assistant', 'post_published', 'Published a facebook post', 'Just listed: 4521 Rosewood Dr, Arcadia — 4bd/3ba on a quarter acre. DM for the private tour list.', 'normal', false, null, null, now() - interval '4 hours'),
    (v_agent, 'marketing_assistant', 'nurture_message_sent', 'Sent an approved nurture email to a sphere contact', 'June market update: Pasadena inventory is up 12% — what that means if you''re thinking of selling this year.', 'normal', false, null, null, now() - interval '8 hours'),
    (v_agent, 'marketing_assistant', 'marketing_plan_step', 'Ran a marketing plan step (send email)', 'via email', 'normal', false, 'contact', c_david::text, now() - interval '1 day 3 hours'),
    (v_agent, 'marketing_assistant', 'post_published', 'Published an instagram post', 'Open house this Saturday at 312 Alder St, Monrovia — 11am to 2pm. Come say hi!', 'normal', false, null, null, now() - interval '2 days 1 hour'),
    (v_agent, 'sales_assistant', 'reactivation_sms', E'Sent a warm reactivation text to Kevin O’Brien', 'Delivered — awaiting reply', 'normal', false, 'contact', c_kevin::text, now() - interval '3 days'),
    (v_agent, 'sales_assistant', 'follow_up_sms', 'Followed up with David Wang about the Arcadia market report', 'He opened it again within an hour', 'normal', false, 'contact', c_david::text, now() - interval '4 days'),
    (v_agent, 'transaction_assistant', 'deadline_tracking', 'Started tracking 148 W Cherry Ave — 4 contingency dates loaded', 'Inspection, appraisal, loan, closing monitored', 'normal', false, 'transaction', t_cherry::text, now() - interval '5 days'),
    (v_agent, 'receptionist', 'inbound_call_answered', 'Answered an after-hours call about selling in Sierra Madre', 'Took a message; suggested a valuation', 'normal', false, null, null, now() - interval '6 days');

  -- ── Money: invoices + expenses (the AI Accountant's domain) ──────
  insert into public.invoices (id, agent_id, contact_id, client_name, client_email, invoice_number, status, issue_date, due_date, subtotal, tax_rate, tax_amount, total, notes, paid_at, created_at) values
    ('0bde0004-0000-4000-8000-000000000001', v_agent, null, 'Hillcrest Realty Group', 'accounting@hillcrestrealty.example.com', 'INV-0012', 'overdue',
     (now() - interval '24 days')::date, (now() - interval '9 days')::date, 2500, 0, 0, 2500,
     'Referral fee — buyer referral, 1830 Oak Knoll Ave closing.', null, now() - interval '24 days'),
    ('0bde0004-0000-4000-8000-000000000002', v_agent, c_maria, 'Maria Lopez', 'maria.lopez@example.com', 'INV-0013', 'sent',
     (now() - interval '3 days')::date, (now() + interval '5 days')::date, 850, 0, 0, 850,
     'Staging coordination — 4521 Rosewood Dr pre-listing.', null, now() - interval '3 days'),
    ('0bde0004-0000-4000-8000-000000000003', v_agent, c_castillo, 'Robert & Joan Castillo', 'castillos@example.com', 'INV-0011', 'paid',
     (now() - interval '18 days')::date, (now() - interval '4 days')::date, 1200, 0, 0, 1200,
     'Pre-sale repair coordination — 87 Birchwood Ln.', now() - interval '5 days', now() - interval '18 days');

  insert into public.invoice_lines (invoice_id, description, quantity, unit_price, amount, sort_order) values
    ('0bde0004-0000-4000-8000-000000000001', 'Buyer referral fee (25% of side)', 1, 2500, 2500, 0),
    ('0bde0004-0000-4000-8000-000000000002', 'Staging consult + vendor coordination', 1, 850, 850, 0),
    ('0bde0004-0000-4000-8000-000000000003', 'Repair vendor coordination + oversight', 1, 1200, 1200, 0);

  insert into public.expenses (agent_id, expense_date, amount, category, vendor, notes, created_at) values
    (v_agent, (now() - interval '2 days')::date, 285, 'Photography & Media', 'SnapHouse Photo Co.', '4521 Rosewood Dr listing shoot', now() - interval '2 days'),
    (v_agent, (now() - interval '5 days')::date, 89, 'Signage & Lockboxes', 'SupraKey', 'Two lockboxes', now() - interval '5 days'),
    (v_agent, (now() - interval '8 days')::date, 450, 'Marketing & Advertising', 'Meta Ads', 'June buyer-lead campaign', now() - interval '8 days'),
    (v_agent, (now() - interval '12 days')::date, 162, 'MLS & Association Dues', 'CRMLS', 'Quarterly MLS dues', now() - interval '12 days'),
    (v_agent, (now() - interval '1 day')::date, 64, 'Mileage & Auto', null, 'Showings — Pasadena loop', now() - interval '1 day');

  -- Accountant activity (matches the invoice story above)
  insert into public.assistant_activities (agent_id, assistant_type, activity_type, summary, outcome, priority, requires_attention, related_entity_type, related_entity_id, created_at) values
    (v_agent, 'accountant', 'invoices_overdue', '1 invoice became overdue (INV-0012)', 'Follow-up recommended', 'high', true, 'invoice', '0bde0004-0000-4000-8000-000000000001', now() - interval '8 hours'),
    (v_agent, 'accountant', 'invoice_paid', 'Invoice INV-0011 from Robert & Joan Castillo was paid', '$1,200 collected', 'normal', false, 'invoice', '0bde0004-0000-4000-8000-000000000003', now() - interval '5 days'),
    (v_agent, 'accountant', 'invoice_sent', 'Sent invoice INV-0013 to Maria Lopez', '$850 now outstanding', 'normal', false, 'invoice', '0bde0004-0000-4000-8000-000000000002', now() - interval '3 days');

  -- ── Notification inbox (lights the bell badge) ───────────────────
  insert into public.agent_inbox_notifications (agent_id, type, priority, title, body, data, read, push_sent_at, created_at) values
    (v_agent, 'hot_lead', 'high', 'Hot lead — Grace Liu', 'Relocating from Seattle, ~$750k cash. Asked for downtown condo tours next week.', '{"deep_link":{"screen":"lead","contact_id":"0bde0001-0000-4000-8000-000000000012"}}'::jsonb, false, now(), now() - interval '3 hours'),
    (v_agent, 'missed_call', 'medium', 'Personal call from Tony Russo', 'Tony Russo called and didn''t reach you. This looks personal — give him a call back when you have a minute.', '{"deep_link":{"screen":"call_log","contact_id":"0bde0001-0000-4000-8000-000000000013"}}'::jsonb, false, now(), now() - interval '2 hours');

  raise notice 'RealtyBoss demo seeded for agent %', v_agent;
end $$;
