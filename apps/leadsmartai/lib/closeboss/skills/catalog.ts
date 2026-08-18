/**
 * Realtor AI Skills Library — the catalog.
 *
 * 59 skills across 9 pillars. Each carries the VALUE it captures and a
 * ready-to-run PROMPT (the SKILL.md body) with compliance baked in. Prompts are
 * STATE-PARAMETERIZED — the placeholders {{state}}, {{license_authority}},
 * {{license_label}}, {{avm_disclaimer_rule}}, {{protected_classes}} are filled
 * from the agent's licensed state (see ./compliance). Agent placeholders
 * ({{agent_name}}, {{license_number}}, {{brokerage}}, {{market}}, {{language}},
 * {{brand_voice}}, {{client_name}}, {{address}}, {{mls_data}}, {{brand_voice}})
 * are filled from the agent profile + client record.
 *
 * Shipped as code so every agent gets improvements on deploy. Per-agent
 * enable/disable + reassignment lives in agent_skill_overrides.
 *
 * GLOBAL PREAMBLE (prepended to every skill at run time):
 *   "You are the AI engine behind {{agent_name}}, {{brokerage}}
 *    ({{license_label}}{{license_number}}), a top producer in {{market}}
 *    ({{state}}). Never invent addresses, comps, prices, or stats — if an input
 *    is missing, ask for it. Never use language referencing or coded to protected
 *    classes: {{protected_classes}} (Fair Housing). Apply {{state}} advertising &
 *    disclosure rules and {{license_authority}} requirements; flag anything
 *    uncertain for broker review. Output in {{language}}. Match {{brand_voice}}."
 */

export type SkillPillar =
  | "lead_gen"
  | "nurture"
  | "valuation"
  | "listing"
  | "buyer"
  | "negotiation"
  | "compliance"
  | "communication"
  | "operations";

/** The 5 AI assistants + the Boss Assistant (which owns the shared validators). */
export type SkillAssignee =
  | "boss"
  | "receptionist"
  | "sales_assistant"
  | "marketing_assistant"
  | "transaction_assistant"
  | "accountant";

export type Skill = {
  id: string;
  num: number;
  pillar: SkillPillar;
  title: string;
  value: string;
  defaultAssignee: SkillAssignee;
  /** Compliance validators run as post-processors on other skills' public output. */
  isValidator?: boolean;
  /** For analytical skills that feed the app UI — a note on the structured output. */
  outputSchema?: string;
  prompt: string;
};

export const GLOBAL_PREAMBLE =
  "You are the AI engine behind {{agent_name}}, {{brokerage}} ({{license_label}}{{license_number}}), a top producer in {{market}} ({{state}}). " +
  "Never invent addresses, comps, prices, or stats — if an input is missing, ask for it. " +
  "Never use language referencing or coded to protected classes: {{protected_classes}} (Fair Housing). " +
  "Apply {{state}} advertising & disclosure rules and {{license_authority}} requirements; flag anything uncertain for broker review. " +
  "Output in {{language}}. Match {{brand_voice}}.";

export const PILLAR_LABEL: Record<SkillPillar, string> = {
  lead_gen: "Lead Generation & Prospecting",
  nurture: "Lead Nurture & Database",
  valuation: "Valuation & Financial Analysis",
  listing: "Listing / Seller Representation",
  buyer: "Buyer Representation",
  negotiation: "Negotiation & Transaction Management",
  compliance: "Compliance & Risk",
  communication: "Communication & Content",
  operations: "Business Operations & Growth",
};

export const ASSIGNEE_LABEL: Record<SkillAssignee, string> = {
  boss: "Boss Assistant",
  receptionist: "Receptionist",
  sales_assistant: "Sales Assistant",
  marketing_assistant: "Marketing Assistant",
  transaction_assistant: "Transaction Assistant",
  accountant: "Accountant",
};

export const SKILLS: Skill[] = [
  // ── Pillar 1 — Lead Generation & Prospecting ──────────────────────
  {
    id: "lead_magnet_builder", num: 1, pillar: "lead_gen", title: "Lead Magnet Builder", defaultAssignee: "sales_assistant",
    value: "Turns one topic into a branded, downloadable asset that captures contacts on autopilot — fills the top of funnel without ad spend.",
    prompt: "Create a {{topic}} lead magnet (e.g., \"First-Time Buyer Guide\") for {{market}}. Audience: {{audience}}. Produce: title + subtitle, 5–7 value-packed sections, a soft CTA to contact {{agent_name}}, and a landing-page headline + 3 bullet promises. Fact-check any stat and cite source + date. Keep language inclusive — no protected-class references. Brand footer: {{agent_name}}, {{brokerage}}, {{license_label}}{{license_number}}.",
  },
  {
    id: "geographic_farm", num: 2, pillar: "lead_gen", title: "Geographic Farm Campaign", defaultAssignee: "marketing_assistant",
    value: "Positions the agent as the neighborhood expert; consistent farm touches are the #1 predictor of listing dominance.",
    prompt: "Build a Just Listed/Just Sold farm campaign for {{farm_area}}. Inputs: {{recent_solds}}. Produce 3 mailer variants (Just Listed, Just Sold, Market Share) each with headline, body, and market stat. Use ONLY verifiable stats from the provided data with source + date. Include a neighborhood-expert CTA and {{license_authority}} disclosure. Suggest a 6-touch annual cadence.",
  },
  {
    id: "expired_fsbo_outreach", num: 3, pillar: "lead_gen", title: "Expired / FSBO / Cancelled Outreach", defaultAssignee: "sales_assistant",
    value: "Attacks the highest-intent seller pool most agents ignore — motivated sellers, warm timing, low competition.",
    prompt: "For this {{listing_history}}, write: (a) a 60-second call script that acknowledges their prior experience without insulting the last agent, (b) a 5-touch text/email follow-up sequence. Lead with what went wrong and how I'd fix it. FLAG at the top: confirm the number is DNC-scrubbed and consent exists before dialing/texting (TCPA). No pressure tactics; fiduciary tone.",
  },
  {
    id: "circle_prospecting", num: 4, pillar: "lead_gen", title: "Circle Prospecting Engine", defaultAssignee: "sales_assistant",
    value: "Converts one transaction into multiple neighbor conversations — free listing leads off work you've already done.",
    prompt: "A home just {{sold_or_listed}} at {{address}}. Write circle-prospecting scripts (call + door + text) to neighbors within {{radius}}: \"your neighborhood is active, curious what your home is worth?\" Include a value offer (free CMA). DNC/TCPA note at top. No equity-mining or fear framing.",
  },
  {
    id: "open_house_system", num: 5, pillar: "lead_gen", title: "Open House System", defaultAssignee: "marketing_assistant",
    value: "Converts foot traffic into a pipeline instead of a one-day event — most agents leave these leads on the table.",
    prompt: "For the open house at {{address}} on {{date}}, produce: (a) pre-event promo (social + email + neighbor invite), (b) a sign-in script that captures timeline + financing + consent to follow up, (c) a same-day and day-3 follow-up message. Fair Housing clean. {{license_authority}} disclosure on public assets.",
  },
  {
    id: "social_content_engine", num: 6, pillar: "lead_gen", title: "Social Content Engine", defaultAssignee: "marketing_assistant",
    value: "Keeps the agent top-of-mind and generates inbound — brand equity compounds while they sleep.",
    prompt: "Create {{count}} social posts for {{platform}} about {{listing_or_topic}}. Each: hook, caption, CTA, hashtags. Vary formats (reel script, carousel, single). No protected-class or \"perfect for families/safe area\" coding. Ensure profile carries {{brokerage}} + {{license_label}}{{license_number}} for ad compliance.",
  },
  {
    id: "speed_to_lead", num: 7, pillar: "lead_gen", title: "Portal Lead Speed-to-Lead Responder", defaultAssignee: "receptionist",
    value: "Speed wins the lead — responding in under 5 minutes multiplies contact rates several-fold.",
    prompt: "Inbound portal lead: {{lead_details}}. Write an instant first response (text + email variants) that (a) answers their property question, (b) asks 2–3 qualifying questions (timeline, financing, are they working with an agent), (c) proposes a next step. Warm, human, not salesy. Consent-to-continue built in.",
  },
  {
    id: "soi_reactivation", num: 8, pillar: "lead_gen", title: "SOI Reactivation", defaultAssignee: "sales_assistant",
    value: "The cheapest business is repeat + referral — this re-warms a dormant database into deals.",
    prompt: "From this {{crm_export}} with last-contact dates, segment contacts (hot/warm/cold, past client/SOI). For each segment write a re-engagement message that adds value (market update, check-in) not a hard ask. CAN-SPAM unsubscribe on emails. Suggest a re-touch cadence.",
  },

  // ── Pillar 2 — Lead Nurture & Database ────────────────────────────
  {
    id: "lead_scoring", num: 9, pillar: "nurture", title: "Lead Qualification & Scoring", defaultAssignee: "receptionist",
    value: "Focuses the agent's hours on deals that will actually close — leverage on the scarcest asset, time.",
    outputSchema: "Return JSON: { score:number, track:\"fast_close\"|\"nurture\"|\"long_term\", reasoning:string, next_action:string }",
    prompt: "Score this lead {{lead_data}} 1–100 on likelihood-to-transact using timeline, financing readiness, motivation, and engagement ONLY. Do NOT use demographic/protected-class signals. Output: score, reasoning, recommended track (fast-close / nurture / long-term), and next action.",
  },
  {
    id: "nurture_drip", num: 10, pillar: "nurture", title: "Nurture / Drip Writer", defaultAssignee: "sales_assistant",
    value: "Automated value-touches convert the 80% of leads who aren't ready today into closings later.",
    prompt: "Write a {{length}}-touch nurture sequence for a {{segment}} lead with a {{timeline}} horizon. Alternate value (market data, tips) with light CTAs. Consistent {{brand_voice}}. CAN-SPAM compliant. Space touches sensibly; note channel per touch.",
  },
  {
    id: "followup_cadence", num: 11, pillar: "nurture", title: "Follow-Up Cadence Manager", defaultAssignee: "sales_assistant",
    value: "\"The fortune is in the follow-up\" — systematized cadence stops leads leaking out of the pipeline.",
    prompt: "Given lead stage {{stage}} and last-contact {{date}}, output the next 3 follow-up actions with timing, channel, and a drafted message each. Respect any opt-out flags. Escalate to a call if engagement signals are high.",
  },
  {
    id: "referral_review", num: 12, pillar: "nurture", title: "Referral & Review Generator", defaultAssignee: "sales_assistant",
    value: "Turns happy closings into reviews and referrals — the flywheel behind every top producer's business.",
    prompt: "Client {{client_name}} just closed. Write: (a) a timed referral-ask script, (b) a review request with a fill-in prompt to make it easy, (c) a drafted sample review they can edit. No incentive language (compliance). Warm and specific to their transaction.",
  },

  // ── Pillar 3 — Valuation & Financial Analysis ─────────────────────
  {
    id: "cma_generator", num: 13, pillar: "valuation", title: "CMA Generator", defaultAssignee: "sales_assistant",
    value: "Wins listings — a data-backed value range positions the agent as the expert and anchors the price conversation.",
    outputSchema: "Return JSON: { subject:{...}, comps:[{address,price,sqft,adjustments,rationale}], value_range:{low,high}, recommendation:string, disclaimer:string }",
    prompt: "Generate a CMA for {{address}} using comps {{mls_data}}. Include: subject summary, 3–6 comps with adjustments and rationale, a defensible value range, and pricing recommendation. Output client-ready in {{language}}. Add an estimate disclaimer ({{avm_disclaimer_rule}}): this is a broker opinion, not an appraisal. Show comp-selection logic.",
  },
  {
    id: "list_price_strategy", num: 14, pillar: "valuation", title: "List-Price Strategy", defaultAssignee: "sales_assistant",
    value: "The right price sells faster and nets more — directly protects the seller's proceeds and the agent's DOM stats.",
    prompt: "Given {{cma}}, current inventory {{inventory}}, and seller goal {{goal}} (speed vs. top dollar), recommend a list price with 3 scenarios (aggressive/market/premium) and expected DOM + risk for each. Label all assumptions. State a range, not a guarantee.",
  },
  {
    id: "investment_roi", num: 15, pillar: "valuation", title: "Rental / Investment ROI", defaultAssignee: "accountant",
    value: "Wins and serves investor clients — quantified returns turn a browsing investor into a buyer.",
    outputSchema: "Return JSON: { cap_rate, cash_on_cash, dscr, monthly_cash_flow, five_year_projection:[...], assumptions:[...] }",
    prompt: "Analyze {{address}} as an investment: price {{price}}, projected rent {{rent}}, expenses {{expenses}}, financing {{terms}}. Output cap rate, cash-on-cash, DSCR, monthly cash flow, and 5-yr projection. Itemize EVERY assumption. Numbers must reconcile. {{language}}. Label as estimate.",
  },
  {
    id: "seller_net_sheet", num: 16, pillar: "valuation", title: "Seller Net Sheet", defaultAssignee: "accountant",
    value: "Removes the #1 seller anxiety (\"what do I actually walk away with?\") and builds trust with transparency.",
    outputSchema: "Return JSON: { sale_price, deductions:[{label,amount}], net_proceeds, note }",
    prompt: "Build a seller net sheet: sale price {{price}}, loan payoff {{payoff}}, commission {{commission}}, closing costs {{costs}}. Show gross → deductions → net proceeds, reconciled to the dollar. Label \"estimate — final figures from escrow.\" {{language}}.",
  },
  {
    id: "buyer_affordability", num: 17, pillar: "valuation", title: "Buyer Affordability / Mortgage Scenarios", defaultAssignee: "accountant",
    value: "Sets realistic expectations early — stops wasted showings and heartbreak, speeds buyers to action.",
    outputSchema: "Return JSON: { affordable_range:{low,high}, piti, dti, scenarios:[{rate,payment}] }",
    prompt: "Given income {{income}}, debts {{debts}}, down payment {{down}}, rate {{rate}}, estimate affordable price range, monthly payment (PITI), and DTI. Show 3 rate scenarios. NOT a lending decision — recommend lender pre-approval. No APR claims.",
  },
  {
    id: "market_report", num: 18, pillar: "valuation", title: "Market / Absorption Report", defaultAssignee: "marketing_assistant",
    value: "Backs every price and offer conversation with authority — data beats opinion in negotiations.",
    prompt: "Produce a market report for {{area}}, period {{period}}: active/pending/sold, median price, DOM, months of supply, YoY trend. Timestamp and source every figure. Neutral framing — no cherry-picking. End with a one-line \"what this means for buyers/sellers.\"",
  },
  {
    id: "neighborhood_deep_dive", num: 19, pillar: "valuation", title: "Property / Neighborhood Deep-Dive", defaultAssignee: "sales_assistant",
    value: "Positions the agent as the local authority and arms buyers with real facts for confident decisions.",
    prompt: "Create a dossier for {{address}}: property facts, recent comps, price trend, amenities, and school data (factual: names, ratings as published, source). Do NOT characterize the area as \"good/bad/safe\" or reference who it \"suits\" (Fair Housing). {{language}}.",
  },

  // ── Pillar 4 — Listing / Seller Representation ────────────────────
  {
    id: "listing_presentation", num: 20, pillar: "listing", title: "Pre-Listing / Listing Presentation", defaultAssignee: "marketing_assistant",
    value: "Wins the signature — a professional, CMA-backed presentation converts appointments into listings.",
    prompt: "Build a listing presentation for {{seller_name}} / {{address}}. Sections: market overview, CMA-backed pricing, my marketing plan, why-me proof, timeline, next steps. Every claim substantiated. {{brand_voice}}, {{language}}. {{license_authority}} disclosure.",
  },
  {
    id: "listing_description", num: 21, pillar: "listing", title: "MLS / Listing Description Writer", defaultAssignee: "marketing_assistant",
    value: "A compelling, compliant description drives showings and syndicates cleanly — and keeps the agent out of a Fair Housing complaint.",
    prompt: "Write MLS remarks + feature bullets for {{property_facts}}. Sell the lifestyle and features. HARD RULE: no references or coded language to family status, religion, race, \"safe,\" \"walking distance to church/school,\" \"perfect for\" — describe the PROPERTY, not the buyer. Original copy only (no copied listing text). Provide a 250-char portal version.",
  },
  {
    id: "listing_marketing_plan", num: 22, pillar: "listing", title: "Listing Marketing Plan", defaultAssignee: "marketing_assistant",
    value: "A visible, tiered plan justifies the commission and gets the seller bought-in from day one.",
    prompt: "Create a marketing plan for {{address}} at {{price_point}}: channels, timeline (pre-launch → launch → live), photography/staging, open houses, digital ads, budget. Tier for {{luxury_or_standard}}. Respect Clear Cooperation timing. Deliverable seller-facing.",
  },
  {
    id: "prep_staging", num: 23, pillar: "listing", title: "Prep / Staging Advisor", defaultAssignee: "marketing_assistant",
    value: "Small pre-list fixes return outsized price gains — this maximizes the seller's net and the sale speed.",
    prompt: "From {{condition_notes_or_photos}}, produce a prioritized prep list: item, why it matters, rough cost (directional), and expected ROI/impact. Separate must-do from nice-to-have. Practical and budget-aware.",
  },
  {
    id: "just_listed_sold", num: 24, pillar: "listing", title: "Just Listed / Just Sold Assets", defaultAssignee: "marketing_assistant",
    value: "Announces momentum, feeds the farm, and generates the next listing off the current one.",
    prompt: "Create a Just {{Listed_or_Sold}} kit for {{address}}: postcard, 3 social posts, email blast. Accurate terms only. Fair Housing clean. {{license_label}}{{license_number}} + {{brokerage}} on public assets.",
  },
  {
    id: "seller_status_update", num: 25, pillar: "listing", title: "Seller Status Update", defaultAssignee: "marketing_assistant",
    value: "Proactive weekly updates prevent seller anxiety and make price-reduction conversations land with data, not conflict.",
    prompt: "From this week's {{activity_log}} (showings, feedback, views), write a seller update: activity summary, market context, honest interpretation, and a recommendation. If a price adjustment is warranted, frame it with data, not blame. {{language}}.",
  },

  // ── Pillar 5 — Buyer Representation ───────────────────────────────
  {
    id: "buyer_consultation", num: 26, pillar: "buyer", title: "Buyer Consultation & Needs Analysis", defaultAssignee: "sales_assistant",
    value: "Sets the relationship up right — captures true criteria AND secures the buyer-broker agreement now required before showings.",
    prompt: "Prepare a buyer consultation packet + intake for {{client_name}}: needs/wants/dealbreakers capture, financing readiness, timeline. Include a plain-language explanation of the buyer-broker agreement and how my compensation works (post-NAR-settlement), with a script to walk them through it. {{language}}.",
  },
  {
    id: "property_match", num: 27, pillar: "buyer", title: "Property Match & Shortlist Ranking", defaultAssignee: "sales_assistant",
    value: "Saves buyers hours and builds trust by surfacing the true best-fits, not just the newest listings.",
    prompt: "Rank {{candidate_listings}} against buyer criteria {{criteria}}. Score each on stated criteria ONLY (not demographics/area \"desirability\"). Output ranked shortlist with a one-line why per home and any tradeoffs. Recommend top 3 to tour.",
  },
  {
    id: "showing_tour", num: 28, pillar: "buyer", title: "Showing Tour Builder", defaultAssignee: "sales_assistant",
    value: "A tight, logical tour respects everyone's time and keeps buyers focused and decisive.",
    prompt: "Build a showing itinerary for {{selected_homes}} on {{date}}: optimal route/order, arrival windows, and a 3-line brief per home (highlights, watch-outs, questions to ask). Confirm showing instructions/access per listing.",
  },
  {
    id: "comparison_matrix", num: 29, pillar: "buyer", title: "Property Comparison Matrix", defaultAssignee: "sales_assistant",
    value: "Cuts through buyer indecision with a clear, objective side-by-side — accelerates the offer decision.",
    prompt: "Compare {{properties}} in a matrix: price, $/sqft, beds/baths, lot, condition, HOA, commute, schools (factual), pros/cons. Objective criteria only. End with a decision framework — the choice stays with the buyer.",
  },
  {
    id: "offer_strategy", num: 30, pillar: "buyer", title: "Offer Strategy Advisor", defaultAssignee: "sales_assistant",
    value: "Wins the home without overpaying — strategic offers are where buyer's agents earn their fee.",
    prompt: "Given comps {{comps}}, competition level {{competition}}, and buyer position {{position}}, recommend an offer strategy: price, terms, contingencies, escalation, and non-price levers. Explain the reasoning and risks. NOTE: agent reviews and approves before submission; no guaranteed outcomes.",
  },

  // ── Pillar 6 — Negotiation & Transaction Management ───────────────
  {
    id: "negotiation_strategist", num: 31, pillar: "negotiation", title: "Counter-Offer / Negotiation Strategist", defaultAssignee: "sales_assistant",
    value: "Protects thousands in every deal — structured negotiation beats winging it and defends the client's interests.",
    prompt: "Offer terms {{terms}}, other party motivations {{motivations}}. Produce a negotiation plan: opening position, concession ladder, walk-away, and talking points for each likely counter. Fiduciary framing — advocate hard, never misrepresent.",
  },
  {
    id: "contract_to_close", num: 32, pillar: "negotiation", title: "Contract-to-Close Timeline", defaultAssignee: "transaction_assistant",
    value: "Nothing falls through the cracks — missed deadlines kill deals and create liability; this prevents both.",
    prompt: "From accepted contract dates {{contract_dates}}, build a milestone timeline: EMD, inspection, appraisal, loan contingency, final walkthrough, closing. Flag each hard deadline for agent review. Output as a tracker with alert lead-times.",
  },
  {
    id: "contingency_manager", num: 33, pillar: "negotiation", title: "Contingency & Deadline Manager", defaultAssignee: "transaction_assistant",
    value: "Keeps contingency periods airtight — protects the client's earnest money and the agent from E&O exposure.",
    prompt: "Track contingencies for {{contract}}: list each, its deadline, status, and the action needed. NEVER auto-waive anything — surface upcoming deadlines to the agent for decision. Daily digest format.",
  },
  {
    id: "disclosure_explainer", num: 34, pillar: "negotiation", title: "Disclosure & Document Explainer", defaultAssignee: "transaction_assistant",
    value: "Demystifies scary paperwork for clients (especially in-language) — builds trust and reduces fall-through.",
    prompt: "Explain {{disclosure_doc}} in plain {{language}}: what it is, what it means for the client, and 3 questions they should ask. This EXPLAINS only — it is not legal advice; recommend an attorney for legal questions. Flag anything unusual.",
  },
  {
    id: "inspection_response", num: 35, pillar: "negotiation", title: "Inspection Response / Repair Negotiation", defaultAssignee: "sales_assistant",
    value: "Turns an inspection report into a strategic ask — recovers real dollars without blowing up the deal.",
    prompt: "From {{inspection_report}}, draft a repair-request strategy: separate material/safety items from cosmetic, recommend ask (repair vs. credit vs. accept), and draft the request. Scope to what matters. Agent approves before sending.",
  },
  {
    id: "closing_checklist", num: 36, pillar: "negotiation", title: "Closing / Final Walkthrough Checklist", defaultAssignee: "transaction_assistant",
    value: "A clean close — catches problems before they become post-closing disputes.",
    prompt: "Produce a pre-close + final-walkthrough checklist for {{transaction}}, verified against contract terms (agreed repairs, inclusions, condition). Flag any discrepancy to resolve before signing.",
  },

  // ── Pillar 7 — Compliance & Risk (VALIDATORS → Boss Assistant) ─────
  {
    id: "fair_housing_checker", num: 37, pillar: "compliance", title: "Fair Housing Copy Checker", defaultAssignee: "boss", isValidator: true,
    value: "Prevents the lawsuit — one bad phrase in an ad can mean a HUD complaint; this is cheap insurance on every asset.",
    prompt: "Scan {{draft_text}} for Fair Housing issues: references or coded language to any protected class ({{protected_classes}}), plus phrases like \"safe,\" \"exclusive,\" \"perfect for [group],\" \"walking distance to [church/school].\" Output: PASS or FLAGGED items with compliant rewrites.",
  },
  {
    id: "advertising_compliance", num: 38, pillar: "compliance", title: "Advertising Compliance Checker", defaultAssignee: "boss", isValidator: true,
    value: "Keeps every ad license-clean — avoids fines and license risk on marketing at scale.",
    prompt: "Check {{marketing_asset}} for {{state}} advertising compliance: required license {{license_label}}{{license_number}}, {{brokerage}} name, team-name rules, and an AVM disclaimer if a value estimate appears ({{avm_disclaimer_rule}}). Output PASS/FLAG with fixes.",
  },
  {
    id: "disclosure_completeness", num: 39, pillar: "compliance", title: "Disclosure Completeness Checker", defaultAssignee: "boss", isValidator: true,
    value: "Ensures a defensible file — missing disclosures are the top source of post-closing litigation.",
    prompt: "Given transaction type {{type}} in {{state}}, list the required disclosure set and check {{file_contents}} for what's present vs. missing. Checklist output — not legal sign-off; recommend broker/attorney review for gaps.",
  },
  {
    id: "respa_guardrail", num: 40, pillar: "compliance", title: "RESPA / Referral Guardrail", defaultAssignee: "boss", isValidator: true,
    value: "Keeps vendor relationships clean — RESPA §8 violations carry serious penalties.",
    prompt: "Review this vendor/referral context {{context}} for RESPA §8 issues (no thing-of-value for referrals). Rewrite any non-compliant phrasing and add required relationship disclosure if applicable.",
  },

  // ── Pillar 8 — Communication & Content ────────────────────────────
  {
    id: "message_drafter", num: 41, pillar: "communication", title: "Situation-Aware Message Drafter", defaultAssignee: "receptionist",
    value: "Fast, on-tone client comms in seconds — saves hours and keeps the agent responsive (which clients equate with competence).",
    prompt: "Draft a {{channel}} message for this situation: {{situation}}, to {{recipient}}. Match {{brand_voice}} and the emotional register of the moment. Provide 2 variants (warm / concise). Consent- and channel-appropriate. {{language}}.",
  },
  {
    id: "objection_scripts", num: 42, pillar: "communication", title: "Objection & Difficult-Conversation Scripts", defaultAssignee: "sales_assistant",
    value: "Converts the moments that lose deals — commission pushback, price reductions, lost offers — into retained trust.",
    prompt: "Give me scripts for {{scenario}} (e.g., \"your commission is too high,\" \"why isn't it selling,\" multiple-offer loss). For each: the reframe, the empathy line, and the value/data response. Honest and fiduciary — no manipulation.",
  },
  {
    id: "bilingual_localization", num: 43, pillar: "communication", title: "Bilingual Translation & Localization", defaultAssignee: "marketing_assistant",
    value: "Unlocks the EN–ZH market others can't serve — the clearest competitive moat and referral engine.",
    prompt: "Localize {{source_text}} between English and Chinese. Use correct real-estate terminology (escrow=託管, contingency=附加條件, etc.), preserve intent and tone, and adapt culturally — this is localization, not literal translation. Flag any term with no clean equivalent.",
  },
  {
    id: "call_summarizer", num: 44, pillar: "communication", title: "Call / Meeting Summarizer", defaultAssignee: "receptionist",
    value: "Nothing gets forgotten — every commitment captured and pushed to the CRM, protecting the relationship and the agent.",
    prompt: "From {{transcript_or_notes}}, produce: summary, decisions, action items (owner + due date), and a clean CRM note. Do NOT invent commitments — if unclear, mark \"to confirm.\" Flag follow-ups.",
  },

  // ── Pillar 9 — Business Operations & Growth ───────────────────────
  {
    id: "gci_planner", num: 45, pillar: "operations", title: "GCI Goal & Activity Planner", defaultAssignee: "accountant",
    value: "Makes income a math problem, not a hope — the single planning exercise most correlated with production.",
    prompt: "Reverse-engineer a plan for {{income_goal}} GCI. Inputs: avg commission {{avg_commission}}, lead→appt {{r1}}, appt→client {{r2}}, client→close {{r3}}. Output: deals needed, appointments needed, leads needed, then daily/weekly activity targets. Math must reconcile to the goal.",
  },
  {
    id: "daily_planner", num: 46, pillar: "operations", title: "Time-Block / Daily Planner", defaultAssignee: "accountant",
    value: "Protects the lead-gen hours that actually produce income — beats reactive, admin-driven days.",
    prompt: "From {{calendar}} and {{priorities}}, build a time-blocked day that PROTECTS a prospecting block first, then appointments, then admin. Batch similar tasks. Output an hour-by-hour schedule.",
  },
  {
    id: "pipeline_tracker", num: 47, pillar: "operations", title: "Pipeline & Commission Tracker", defaultAssignee: "accountant",
    value: "Clear sightline on future income — enables confident hiring, spending, and forecasting.",
    prompt: "From {{deal_list}} (stage, price, side, close date), build a pipeline view with projected GCI by month and a weighted forecast by stage-probability. Label projections as estimates. Flag at-risk deals.",
  },
  {
    id: "vendor_directory", num: 48, pillar: "operations", title: "Vendor / Partner Directory", defaultAssignee: "transaction_assistant",
    value: "A trusted referral network makes the agent a one-stop concierge — deepens loyalty and referrals.",
    prompt: "For need {{need}} in {{area}}, recommend vetted vendor types and draft a warm intro. Add required relationship disclosure. NO pay-for-referral language (RESPA §8).",
  },
  {
    id: "market_newsletter", num: 49, pillar: "operations", title: "Market Update Newsletter", defaultAssignee: "marketing_assistant",
    value: "Recurring authority touch to the whole database — the low-effort habit that keeps referrals flowing.",
    prompt: "Write a {{period}} market newsletter for {{market}}: headline stat, 3 trends (sourced + dated), one lifestyle/local item, and a soft CTA. {{brand_voice}}, {{language}}. CAN-SPAM unsubscribe. {{license_authority}} disclosure.",
  },
  {
    id: "case_study", num: 50, pillar: "operations", title: "Case Study / Testimonial Builder", defaultAssignee: "marketing_assistant",
    value: "Converts wins into marketing proof that closes the next client — social proof is the highest-converting asset.",
    prompt: "Turn this closed deal {{transaction_summary}} + {{client_quote}} into a case study: challenge → strategy → result (with accurate numbers). Get/confirm client consent. Produce a long version and a social-caption version.",
  },
  {
    id: "recruiting_kit", num: 51, pillar: "operations", title: "Team Recruiting Kit", defaultAssignee: "boss",
    value: "Scales the business beyond the founder's own hours — the leverage that builds a real enterprise.",
    prompt: "Build a recruiting kit for {{target_agent_profile}} using team stats {{team_stats}}: value proposition, recruiting scripts (call + DM), and a 30-day onboarding outline. Accurate splits/support only — NO income guarantees.",
  },

  // ── Additions (52–59) ─────────────────────────────────────────────
  {
    id: "wire_fraud_warning", num: 52, pillar: "compliance", title: "Wire-Fraud Warning to Client", defaultAssignee: "transaction_assistant",
    value: "Wire fraud is the #1 real-estate cyber threat — a clear, timed warning protects the client's funds and the agent from a catastrophic claim.",
    prompt: "Draft a wire-fraud warning for {{client_name}} at {{transaction_stage}}: never wire funds based on emailed instructions, always call the escrow/title officer at an independently-verified number before sending, and how to spot spoofed emails/last-minute changes. Calm and clear, not alarming. {{language}}. Include: verify by phone, we will never email you wiring changes.",
  },
  {
    id: "video_scripts", num: 53, pillar: "communication", title: "Listing & Agent Video Scripts", defaultAssignee: "marketing_assistant",
    value: "Video is the highest-engagement format in real estate — scripts turn a listing or the agent into shareable, on-brand video without a copywriter.",
    prompt: "Write video scripts for {{video_type}} (listing tour / neighborhood / agent intro / just-sold) about {{subject}}. Produce: a 30–60s script with shot notes, an on-screen-text overlay list, and a caption + hashtags. Sell the property/lifestyle, never the buyer. Fair Housing clean. {{brand_voice}}, {{language}}. {{license_label}}{{license_number}} on public assets.",
  },
  {
    id: "buyer_broker_objection", num: 54, pillar: "buyer", title: "Buyer-Broker / NAR-Settlement Objection Handling", defaultAssignee: "sales_assistant",
    value: "Post-settlement, buyers question the agreement and the fee — handling this well is the difference between signing the buyer and losing them.",
    prompt: "Give me scripts for buyer-broker-agreement objections (e.g., \"why do I have to sign this,\" \"why should I pay you,\" \"can't I just go to the listing agent\") in the post-NAR-settlement context. For each: the empathy line, the plain-language explanation of what my representation and fee cover, and how compensation can be structured. Honest, transparent, fiduciary — no scare tactics. {{language}}.",
  },
  {
    id: "multiple_offer_management", num: 55, pillar: "negotiation", title: "Multiple-Offer Management (Listing Side)", defaultAssignee: "sales_assistant",
    value: "Running a clean multiple-offer process nets the seller more and keeps the agent out of a fairness complaint.",
    prompt: "Given offers {{offers}} on {{address}} and seller goal {{goal}}, build a listing-side multiple-offer plan: an objective offer-comparison matrix (price, terms, contingencies, financing strength, net-to-seller), a highest-and-best or counter strategy, and a fair, consistent communication script to all buyer agents. Treat all offers even-handedly (Fair Housing / fairness). Seller decides; agent advises.",
  },
  {
    id: "review_response", num: 56, pillar: "operations", title: "Review Response Writer", defaultAssignee: "marketing_assistant",
    value: "How you respond to reviews — especially negative — shapes reputation more than the review itself.",
    prompt: "Write a response to this {{review}} ({{sentiment}}). For positive: gracious, specific, on-brand. For negative: professional, non-defensive, acknowledge + offer to take it offline, NEVER disclose confidential client/transaction details or violate privacy. {{brand_voice}}, {{language}}. Provide one short and one longer variant.",
  },
  {
    id: "relocation_referral", num: 57, pillar: "operations", title: "Agent-to-Agent / Relocation Referral", defaultAssignee: "sales_assistant",
    value: "Out-of-area and relocation clients are pure referral income (RESPA-clean, unlike vendor referrals) — a real moat for the EN–ZH / overseas-buyer market.",
    prompt: "A client is {{relocating_from_or_to}} {{location}}. Draft: (a) a referral outreach to a qualified agent in that market (what the client needs, referral-fee terms), (b) a client-facing message explaining the handoff and that they're in good hands. Note: agent-to-agent referral fees between licensees are permitted; this is NOT a RESPA vendor referral. {{language}}.",
  },
  {
    id: "virtual_staging_disclosure", num: 58, pillar: "compliance", title: "Virtual-Staging & Photo-Edit Disclosure", defaultAssignee: "marketing_assistant",
    value: "Undisclosed virtual staging / heavy photo edits are a fast-growing complaint and MLS-violation source — a clear disclosure label is cheap protection.",
    prompt: "For listing media on {{address}} that uses {{edit_type}} (virtual staging / sky replacement / item removal / rendering), produce the required disclosure label + placement (per MLS rules and {{state}} advertising rules), and confirm the copy never misrepresents the property's actual condition. Output the exact caption/watermark text and where it must appear.",
  },
  {
    id: "price_reduction_campaign", num: 59, pillar: "listing", title: "Price-Reduction Recommendation & Campaign", defaultAssignee: "marketing_assistant",
    value: "A data-backed, well-communicated price drop re-ignites a stale listing without damaging the seller relationship.",
    prompt: "For {{address}} at {{days_on_market}} DOM with {{activity}} (showings/feedback/views) and market data {{market_data}}, recommend whether and how much to adjust: the data case, the seller-facing conversation script (data not blame), and a re-launch asset set (\"price improvement\" social + email + fresh remarks). Frame as a strategic move, not a failure. {{language}}.",
  },
];

export function getSkill(id: string): Skill | null {
  return SKILLS.find((s) => s.id === id) ?? null;
}

export function skillsForAssignee(assignee: SkillAssignee): Skill[] {
  return SKILLS.filter((s) => s.defaultAssignee === assignee);
}

export const VALIDATOR_SKILLS = SKILLS.filter((s) => s.isValidator);
