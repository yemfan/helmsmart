/**
 * "Switch from [CRM]" landing pages — registry.
 *
 * Each entry powers a page at /switch-from/<slug> with:
 *   - Why-leave pain points
 *   - Migration steps (export from source → import to LeadSmart)
 *   - Feature comparison highlights (a subset of /agent/compare)
 *   - Concierge migration CTA (white-glove migration offer)
 *
 * Adding a new CRM: append a SwitchSource entry, drop a JSON-LD
 * description, and the dynamic route + sitemap + index page pick it
 * up automatically.
 */

export type SwitchSource = {
  slug: string;
  /** Display name of the source CRM. */
  name: string;
  /** Marketing pitch as the source CRM advertises itself, in their words. */
  positioning: string;
  /** Visible monthly price range (USD) — kept current with /agent/compare. */
  priceRange: string;
  /** Headline shown on the page (overridden by render if missing). */
  heroHeadline: string;
  /** Sub-head under the hero. */
  heroSubhead: string;
  /**
   * Time-sensitive callout shown above the hero. Only set when there's
   * a real reason to act now (e.g. LionDesk shutdown). Leave undefined
   * for evergreen pages.
   */
  urgencyBanner?: string;
  /**
   * Optional companion content. If we already published a blog post
   * about this CRM (e.g. the LionDesk shutdown piece), link it.
   */
  companionPost?: { href: string; label: string };
  /** Why agents are leaving. 3–4 pain points specific to this CRM. */
  painPoints: Array<{ title: string; body: string }>;
  /** Features where LeadSmart wins (drives the comparison block). */
  comparisonWins: Array<{ feature: string; them: string; us: string }>;
  /** Step-by-step migration. Generic enough to cover most data shapes. */
  migrationSteps: string[];
  /** FAQ shown at the bottom. */
  faq: Array<{ q: string; a: string }>;
};

const COMMON_MIGRATION_STEPS = [
  "Export your contacts as CSV from <SOURCE>. Most CRMs put this under Settings → Data → Export.",
  "Export any active sequences / drips / templates as text or PDF — drip-campaign logic doesn't port cleanly between CRMs, but your copy does.",
  "Sign up for LeadSmart AI at /start-free. Free 14-day trial, no credit card.",
  "Open Settings → Data & Tools → Import contacts in LeadSmart and upload the CSV. Field mapping auto-detects Name / Email / Phone / Source / Notes.",
  "Run the import. Duplicates are merged on email + phone. If anything looks off, click Undo last import within 24 hours to roll the entire batch back.",
  "Optional: enable concierge migration (link below) and we'll do the import + sequence rebuild for you.",
];

const COMMON_FAQ: Array<{ q: string; a: string }> = [
  {
    q: "Will I lose my contact history?",
    a: "No. The CSV export from your current CRM includes every contact, and LeadSmart's import keeps all notes + custom fields in their own columns. Conversation history (SMS / call recordings) doesn't port between platforms — that's a CRM-industry limitation, not a LeadSmart one — but you can attach the exported activity log as a file on each contact.",
  },
  {
    q: "How long does a migration take?",
    a: "Self-serve migrations run 30–60 minutes for ~1,000 contacts. With concierge migration (we do it for you) most agents are fully cut over in 2–3 business days, including rebuilding any drip sequences in LeadSmart's template library.",
  },
  {
    q: "Can I run both CRMs in parallel during the switch?",
    a: "Yes. Most agents run parallel for 1–2 weeks. Just disable AI auto-send on the old CRM so leads don't get double-messaged, and route new inbound to LeadSmart while you wrap up active deals in the old system.",
  },
  {
    q: "What's the catch with the concierge migration?",
    a: "Free for agents migrating from LionDesk, Follow Up Boss, kvCORE, Lofty, BoomTown, or Sierra Interactive through 2026. You commit to a 3-month LeadSmart plan (Pro tier or higher); we commit to a working migration within 5 business days, or you keep the trial credits regardless.",
  },
];

export const SWITCH_SOURCES: ReadonlyArray<SwitchSource> = [
  {
    slug: "liondesk",
    name: "LionDesk",
    positioning: "Affordable solo-agent CRM — $25–$83 / mo.",
    priceRange: "$25–$83 / mo",
    heroHeadline: "Switching from LionDesk to LeadSmart AI",
    heroSubhead:
      "LionDesk is shutting down. We'll move your contacts, rebuild your sequences, and get you live on a CRM with real AI follow-up — in under a week.",
    urgencyBanner:
      "LionDesk is winding down its CRM. Don't wait for the lights-out date — pull your contacts now while every feature still works.",
    companionPost: {
      href: "/blog/liondesk-shutdown-what-agents-should-do-next",
      label: "Read: LionDesk Is Shutting Down — What Solo Agents Should Do Next",
    },
    painPoints: [
      {
        title: "The platform is sunsetting",
        body: "LionDesk has announced a wind-down. Sunset timelines for tools like this typically run 60–180 days; pulling your contacts now beats scrambling on the final day.",
      },
      {
        title: "No real AI follow-up",
        body: "Drips and templates were the product. There's no sub-minute AI text-back, no missed-call recovery, no autonomous reply engine — exactly the gap that's been costing solo agents deals.",
      },
      {
        title: "Mobile workflow stuck in 2015",
        body: "The mobile experience never matched the desktop. The agents winning today need inbox, deal updates, and AI drafts one tap away — not a stripped-down companion app.",
      },
      {
        title: "Migration window is closing",
        body: "Once the platform shuts down, exports stop. The longer you wait, the higher the chance you lose contact history, notes, or activity logs forever.",
      },
    ],
    comparisonWins: [
      {
        feature: "AI follow-up under 60 sec, 24/7",
        them: "Drip + template only",
        us: "Native, on every plan",
      },
      {
        feature: "Missed-call text-back",
        them: "Add-on integration",
        us: "Out of the box",
      },
      {
        feature: "Voice AI for inbound calls",
        them: "Not available",
        us: "Yes — public test-drive at /voice-ai-test-drive",
      },
      {
        feature: "Bilingual EN / 中文",
        them: "English only",
        us: "Native bilingual templates + AI",
      },
      {
        feature: "Roadmap stability",
        them: "Platform sunsetting",
        us: "Actively shipping every 2 weeks",
      },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: [
      {
        q: "How long do I have to migrate before LionDesk shuts down?",
        a: "Sunset windows for CRMs like this typically run 60–180 days, with a read-only export window after that. Pull your contacts now — every day you wait increases the risk of losing data or missing the final export.",
      },
      ...COMMON_FAQ,
    ],
  },
  {
    slug: "follow-up-boss",
    name: "Follow Up Boss",
    positioning: "Power-team CRM built around inside sales agents.",
    priceRange: "$69–$1,000+ / mo",
    heroHeadline: "Switching from Follow Up Boss to LeadSmart AI",
    heroSubhead:
      "If you're a solo agent paying enterprise prices for a team-of-50 feature set you'll never touch, the math doesn't work. Move to a CRM priced for solo P&Ls — with native AI follow-up instead of bolt-on add-ons.",
    painPoints: [
      {
        title: "Built for teams, sold to solo agents",
        body: "FUB's roles, ISA queues, and lead-router rules are designed for a team of inside sales agents dialing a lead pool — not a solo agent juggling showings, calls, and texts from their phone.",
      },
      {
        title: "AI is bolted on, not native",
        body: "AI features are sold as integrations (Aiva, Conversion Monster, etc.) — extra subscriptions stacked on top. LeadSmart's AI follow-up, voice AI, and Deal Coach are native and included on every paid plan.",
      },
      {
        title: "Costs balloon at the features that matter",
        body: "The advertised $69/mo entry tier is the starting point. Add the dialer, AI integrations, and meaningful seat counts and you're looking at $300–$1,000+ / mo — without owning the AI.",
      },
      {
        title: "Migration is the right time to upgrade, not lateral-move",
        body: "Switching from FUB usually means more features for less money. Solo agents who switch to LeadSmart typically cut their CRM spend by 60–80% while gaining AI follow-up, voice AI, and missed-call recovery.",
      },
    ],
    comparisonWins: [
      {
        feature: "Native AI SMS responder",
        them: "Third-party integration ($)",
        us: "Native, every plan",
      },
      {
        feature: "Native AI email responder",
        them: "Not available natively",
        us: "Yes, autonomous reply",
      },
      {
        feature: "Voice AI for inbound calls",
        them: "Not available",
        us: "Native + public test-drive",
      },
      {
        feature: "Solo-agent pricing",
        them: "$69–$1,000+ / mo",
        us: "$79 / mo starting",
      },
      {
        feature: "AI Coaching with peer benchmarks",
        them: "Not available",
        us: "Yes, included on Pro+",
      },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: COMMON_FAQ,
  },
  {
    slug: "lofty",
    name: "Lofty",
    positioning: "Agentic-AI-branded IDX + CRM (formerly Chime).",
    priceRange: "$499+ / mo",
    heroHeadline: "Switching from Lofty to LeadSmart AI",
    heroSubhead:
      "Lofty's marketing leans hard on \"agentic AI\" but the in-product reality is uneven — and the bill is enterprise-tier. Move to a CRM with the same AI promise actually shipped, at solo-agent pricing.",
    painPoints: [
      {
        title: "AI text-back has noticeable production lag",
        body: "Demos show sub-minute response; in production agents commonly report multi-minute delays and occasional drops. The whole point of the feature is the sub-60-second response — if it doesn't fire reliably, you're paying for a promise.",
      },
      {
        title: "Off-brand SMS templates trip spam filters",
        body: "Lofty's AI ships with generic copy that recipients flag as templated, hurting deliverability over time. Custom copy + per-agent style tuning matter more than the AI label.",
      },
      {
        title: "Lead-source attribution is unreliable",
        body: "Multi-portal leads frequently land with the wrong source set, which corrupts your ROI math. Once you start spending real ad money, that drift becomes expensive.",
      },
      {
        title: "Enterprise pricing, no free trial",
        body: "Lofty explicitly does not offer a free trial — you commit blind. LeadSmart starts at $79/mo with a 14-day free trial; you can see the AI actually work before paying.",
      },
    ],
    comparisonWins: [
      {
        feature: "Free trial before committing",
        them: "Demo only — no free trial",
        us: "14-day free trial, no credit card",
      },
      {
        feature: "AI follow-up that ships",
        them: "Agentic-AI branding, uneven delivery",
        us: "Native, every plan, sub-60s response",
      },
      {
        feature: "Solo-agent pricing",
        them: "$499+ / mo",
        us: "$79 / mo starting",
      },
      {
        feature: "Lead-source attribution",
        them: "Unreliable across portals",
        us: "Source-stable, dedupe-aware",
      },
      {
        feature: "Voice AI for inbound calls",
        them: "Not available",
        us: "Native + public test-drive",
      },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: COMMON_FAQ,
  },
  {
    slug: "boomtown",
    name: "BoomTown",
    positioning: "Top-end lead-conversion platform for big teams ($1,500+ / mo).",
    priceRange: "$1,500+ / mo",
    heroHeadline: "Switching from BoomTown to LeadSmart AI",
    heroSubhead:
      "BoomTown is excellent for a 20-agent brokerage with a dedicated CRM admin. If you're a solo agent or small team running your own book, you're paying for a Cadillac to drive to the grocery store. Switch to a CRM priced for solo P&Ls with the same AI follow-up speed.",
    painPoints: [
      {
        title: "Sticker shock and seat lock-in",
        body: "$1,500+/mo is the starting line — typical mid-size deployments run $3K–$5K. If you're a solo agent or 2–3-person team, you're funding a feature set you'll never use.",
      },
      {
        title: "Designed for an ISA team you don't have",
        body: "BoomTown's lead routing, queues, and accountability dashboards exist because brokerages run inside sales agents. As a solo, you ARE the ISA — half the surface area is dead weight.",
      },
      {
        title: "Setup requires a Success Assurance team",
        body: "The product is too complex to self-serve, so it ships with a paid Lead Concierge team. That's a tell — you shouldn't need a managed-services line item to use your CRM.",
      },
      {
        title: "Annual contracts and onboarding fees",
        body: "BoomTown locks in annual commitments and bills onboarding fees on top. LeadSmart is month-to-month with no setup fee and no commitment beyond the current period.",
      },
    ],
    comparisonWins: [
      {
        feature: "Solo-agent pricing",
        them: "$1,500+ / mo · $3K–$5K typical",
        us: "$79 / mo starting · month-to-month",
      },
      {
        feature: "Onboarding fee",
        them: "Yes, in addition to monthly",
        us: "None · self-serve or concierge included",
      },
      {
        feature: "Contract commitment",
        them: "Annual",
        us: "Month-to-month",
      },
      {
        feature: "Native AI follow-up",
        them: "Predictive CRM branding, basic templates",
        us: "Sub-60s AI replies + missed-call text-back",
      },
      {
        feature: "Voice AI for inbound calls",
        them: "Not available",
        us: "Native + public test-drive",
      },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: COMMON_FAQ,
  },
  {
    slug: "sierra-interactive",
    name: "Sierra Interactive",
    positioning: "IDX-first CRM with strong investor lean ($500+ / mo).",
    priceRange: "$500+ / mo",
    heroHeadline: "Switching from Sierra Interactive to LeadSmart AI",
    heroSubhead:
      "Sierra has the best IDX site in the category — and the weakest mobile experience. If your day happens off your laptop, you're fighting the product. Switch to a CRM where the mobile and AI surfaces are the main product, not an afterthought.",
    painPoints: [
      {
        title: "Weak mobile experience",
        body: "Sierra's mobile companion app trails the desktop substantially. If your actual job happens between showings, that's a daily friction tax.",
      },
      {
        title: "SMS automation requires third-party integrations",
        body: "Sierra punts SMS to add-ons (Twilio, third-party tools you wire yourself). LeadSmart ships A2P-registered SMS native, with AI replies and missed-call text-back included.",
      },
      {
        title: "Pre-AI architecture, retrofitted",
        body: "Sierra was built before AI follow-up was table stakes. The features exist but feel grafted on; the rest of the CRM hasn't been reimagined around the AI loop.",
      },
      {
        title: "Setup-heavy action plans",
        body: "Sierra's Action Plans are powerful but require real configuration time. LeadSmart's defaults are designed to work day-one with copy you'd actually send.",
      },
    ],
    comparisonWins: [
      {
        feature: "Native SMS pipeline (A2P 10DLC)",
        them: "Third-party integration",
        us: "Native, every plan",
      },
      {
        feature: "Mobile-first workflow",
        them: "Desktop-first, mobile companion lags",
        us: "Mobile parity — same surface, one tap away",
      },
      {
        feature: "AI follow-up + missed-call recovery",
        them: "Add-on or third-party",
        us: "Native on every plan",
      },
      {
        feature: "Voice AI for inbound calls",
        them: "Not available",
        us: "Native + public test-drive",
      },
      {
        feature: "Time to first lead handled",
        them: "Days of action-plan setup",
        us: "Same afternoon",
      },
    ],
    migrationSteps: COMMON_MIGRATION_STEPS,
    faq: COMMON_FAQ,
  },
  {
    slug: "kvcore",
    name: "kvCORE",
    positioning: "All-in-one IDX website + CRM, sold via brokerage.",
    priceRange: "$499+ / mo",
    heroHeadline: "Switching from kvCORE to LeadSmart AI",
    heroSubhead:
      "kvCORE is overkill for solo agents — and brokerage-funded plans evaporate when you leave or your brokerage drops the contract. Build your own CRM stack at solo-agent prices, with the AI features kvCORE adds as expensive bolt-ons.",
    painPoints: [
      {
        title: "Designed for brokerages, not solo agents",
        body: "Roles, lead-router matrices, multi-team seat permissions — useful at a 50-agent brokerage, dead weight at a one-person shop. The complexity makes it harder to actually run your day.",
      },
      {
        title: "Pricing is brokerage-funded — and that funding vanishes",
        body: "Most kvCORE seats are paid for by the brokerage. If you leave, switch firms, or your brokerage drops kvCORE, you lose access — and your data is locked behind their workflow.",
      },
      {
        title: "AI assistant ships off-brand SMS",
        body: "kvCORE's AI assistant (Alex) sends templated messages that recipients commonly flag as spam, hurting deliverability and damaging your reputation with leads.",
      },
      {
        title: "Weeks of onboarding for features you'll barely use",
        body: "kvCORE onboarding takes 2–6 weeks because the surface area is enormous. LeadSmart most-onboard agents are live in under an afternoon — same core features, none of the cruft.",
      },
    ],
    comparisonWins: [
      {
        feature: "Solo-agent pricing",
        them: "$499+ / mo (brokerage-funded)",
        us: "$79 / mo starting",
      },
      {
        feature: "AI SMS that doesn't read as spam",
        them: "Off-brand, generic templates",
        us: "Trained on your style, escalates intelligently",
      },
      {
        feature: "Voice AI for inbound calls",
        them: "Not available",
        us: "Native + public test-drive",
      },
      {
        feature: "Onboarding time to first lead handled",
        them: "2–6 weeks",
        us: "Under an afternoon",
      },
      {
        feature: "Data portability",
        them: "Limited export, brokerage-gated",
        us: "Full CSV export anytime, no quota",
      },
    ],
    migrationSteps: [
      "Open Settings → Data Export in kvCORE. If you don't see the option, ask your brokerage admin — most kvCORE permissions gate this by default.",
      "Export your contacts, deals, and activity history as separate CSVs.",
      "Sign up for LeadSmart AI at /start-free. Free 14-day trial, no credit card.",
      "Open Settings → Data & Tools → Import contacts in LeadSmart and upload the contacts CSV. Field mapping auto-detects Name / Email / Phone / Source / Notes.",
      "Run the import. Duplicates are merged on email + phone. Use Undo last import within 24 hours if anything looks off.",
      "Re-create your most-used drip sequences inside LeadSmart's Templates → Sequences. The default LeadSmart sequences (buyer onboarding, FSBO outreach, expired follow-up) often outperform kvCORE drips out of the box.",
      "Optional: enable concierge migration (link below) and we'll do the import + sequence rebuild for you.",
    ],
    faq: [
      {
        q: "What if my brokerage controls my kvCORE access?",
        a: "Most brokerages allow agent-level data export on request. If your brokerage refuses, the agent's contact list is still legally the agent's — escalate to the broker / managing broker. As a fallback, you can rebuild your contact list from your email inbox and phone exports while we set up the new CRM.",
      },
      ...COMMON_FAQ,
    ],
  },
];

export function getSwitchSource(slug: string): SwitchSource | null {
  return SWITCH_SOURCES.find((s) => s.slug === slug) ?? null;
}
