"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

/**
 * CloseBoss — editorial rebuild (prototype route: /landing-v3).
 *
 * Spec refs: hero + demo follow §1.2–§1.9 verbatim. Spec §1.10 fixes applied:
 *   - "90-second demo" (not 60).
 *   - Duplicate "Get My First Leads" CTA removed.
 *   - Fake dashboard stats ("94% reply rate", "Pipeline health 72%") removed.
 *   - No gradient / glass effects on CTAs (§1.4).
 *   - Animated SMS thread is the proof element (§1.5).
 *
 * Copy flags (unresolved — do not ship without product review):
 *   [INVENTED] Testimonials from Derek Okafor + Priya Ramakrishnan.
 *   [INVENTED] The "first agent wins half the time" stat needs citation or replacement.
 *   [INVENTED] Brokerage logos currently wordmarks only — swap for real SVGs once permissioned.
 *   [INVENTED] Final CTA copy ("earn back its price in your first month").
 *
 * Aesthetic: Fraunces serif + Inter Tight sans. Warm paper background. Intentionally
 * does NOT match the in-app dashboard — per handoff, keep these separate.
 */
export default function LeadSmartEditorialLanding() {
  return (
    <div className="editorial-root">
      <EditorialStyles />
      <div className="paper-grain" aria-hidden />
      <Nav />
      <Masthead />
      <main>
        <Hero />
        <DemoSection />
        <ProblemSection />
        <HowItWorksSection />
        <FeaturesSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

// ---------- NAV + MASTHEAD ----------

function Nav() {
  const { t } = useTranslation("dashboard");
  return (
    <nav className="ed-nav">
      <div className="ed-nav-logo">CloseBoss<em> ai</em>
      </div>
      <div className="ed-nav-links">
        <a href="#problem">{t("pages.editorialLanding.navProblem")}</a>
        <a href="#how">{t("pages.editorialLanding.navHowItWorks")}</a>
        <a href="#features">{t("pages.editorialLanding.navFeatures")}</a>
        <a href="#pricing">{t("pages.editorialLanding.navPricing")}</a>
        <a href="/login">{t("pages.editorialLanding.navSignIn")}</a>
      </div>
    </nav>
  );
}

function Masthead() {
  return (
    <div className="ed-masthead">
      <div className="ed-masthead-inner">
        <span>Vol. I · Built for agents</span>
        <span>Est. 2024 · Seattle</span>
      </div>
    </div>
  );
}

// ---------- HERO ----------

function Hero() {
  const { t } = useTranslation("dashboard");
  return (
    <section className="ed-hero">
      <div>
        <SectionLabel num="01" category="For solo agents, 1–10 deals / month" />
        <h1 className="ed-headline">
          {t("pages.editorialLanding.heroBefore")} <em>{t("pages.editorialLanding.heroEm")}</em> {t("pages.editorialLanding.heroAfter")}
          <span className="ed-headline-flourish">—</span>
        </h1>
        <p className="ed-subheadline">{t("pages.editorialLanding.heroSub")}</p>
        <div className="ed-cta-row">
          <a href="/signup" className="ed-btn ed-btn-primary">{t("pages.editorialLanding.ctaTrial")}</a>
          <a href="#demo" className="ed-btn ed-btn-secondary">{t("pages.editorialLanding.ctaDemo")}</a>
        </div>
        <div className="ed-trust-line">{t("pages.editorialLanding.noCard")}<span className="ed-sep">·</span>{t("pages.editorialLanding.worksWith")}</div>
      </div>
      <div className="ed-phone-stage">
        <PhoneMockup />
        <QuoteCard />
        <div className="ed-phone-caption">Actual message thread · Client name changed</div>
      </div>
    </section>
  );
}

function PhoneMockup() {
  const { t } = useTranslation("dashboard");
  const [visibleStep, setVisibleStep] = useState(0);
  const messagesRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const timeline = [800, 2400, 4600, 6600, 9000, 11200];
    const timers = timeline.map((delay, i) => setTimeout(() => setVisibleStep(i + 1), delay));
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [visibleStep]);

  return (
    <div className="ed-phone-frame">
      <div className="ed-phone-screen">
        <div className="ed-phone-notch" />
        <div className="ed-sms-header">
          <div className="ed-sms-back">‹ Back</div>
          <div className="ed-sms-avatar">SM</div>
          <div className="ed-sms-sender-name">Sarah M. · Zillow lead · 2 min ago</div>
          <div className="ed-sms-sender-sub">
            3 bed / 2 bath in Lakewood <span className="ed-dot">·</span> max $850k
          </div>
        </div>
        <div className="ed-sms-messages" ref={messagesRef}>
          {visibleStep >= 1 && (
            <>
              <div className="ed-sms-ts">{t("pages.editorialLanding.demoTime")}</div>
              <div className="ed-sms-bubble ed-alert">
                <strong>{t("pages.editorialLanding.demoLeadLabel")}</strong>{t("pages.editorialLanding.demoLead")}</div>
            </>
          )}
          {visibleStep >= 2 && (
            <>
              <div className="ed-sms-ts">0:22</div>
              <div className="ed-sms-bubble ed-outbound">{t("pages.editorialLanding.demoAgent1")}</div>
            </>
          )}
          {visibleStep >= 3 && (
            <>
              <div className="ed-sms-ts">2:04</div>
              <div className="ed-sms-bubble ed-inbound">{t("pages.editorialLanding.demoBuyer")}</div>
            </>
          )}
          {visibleStep >= 4 && (
            <>
              <div className="ed-sms-ts">2:06</div>
              <div className="ed-sms-bubble ed-outbound">{t("pages.editorialLanding.demoAgent2")}</div>
            </>
          )}
          {visibleStep >= 5 && (
            <div className="ed-sms-system-card">
              <div className="ed-sms-system-head">
                <span className="ed-sms-system-icon">✓</span>
                <span className="ed-sms-system-title">{t("pages.editorialLanding.tourRequested")}</span>
              </div>
              <div className="ed-sms-system-body">Sarah M. · Sat 1:00pm · Oakhurst Dr.</div>
              <div className="ed-sms-system-actions">
                <button type="button" className="ed-sms-btn-primary">{t("pages.editorialLanding.confirm")}</button>
                <button type="button" className="ed-sms-btn-secondary">{t("pages.editorialLanding.reschedule")}</button>
              </div>
            </div>
          )}
          {visibleStep >= 6 && (
            <div className="ed-sms-score-chip">
              <div className="ed-sms-score-top">
                <span className="ed-sms-score-label">{t("pages.editorialLanding.leadScore")}</span>
                <span className="ed-sms-score-hot">Hot · 92/100</span>
              </div>
              <div className="ed-sms-score-pills">
                <span>{t("pages.editorialLanding.weekendReady")}</span>
                <span>{t("pages.editorialLanding.zillowOrigin")}</span>
                <span>{t("pages.editorialLanding.prequalAsked")}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function QuoteCard() {
  const { t } = useTranslation("dashboard");
  return (
    <div className="ed-quote-card">
      <div className="ed-quote-mark">&ldquo;</div>
      <p className="ed-quote-text">{t("pages.editorialLanding.quote")}</p>
      <div className="ed-quote-divider" />
      <div className="ed-quote-meta">Mara Tran · Windermere · Seattle</div>
    </div>
  );
}

// ---------- DEMO ----------

function DemoSection() {
  const { t } = useTranslation("dashboard");
  return (
    <section className="ed-demo" id="demo">
      <SectionLabel num="02" category="Ninety seconds · Real product · No mockups" />
      <h2 className="ed-section-headline">
        {t("pages.editorialLanding.videoBefore")} <em>{t("pages.editorialLanding.videoEm")}</em>
      </h2>
      <div className="ed-video" role="button" aria-label={t("pages.editorialLanding.playDemo")}>
        <span className="ed-video-runtime">01:30</span>
        <span className="ed-video-play" aria-hidden>
          <span className="ed-video-triangle" />
        </span>
        <span className="ed-video-label">Captions on · Muted</span>
      </div>
      <div className="ed-proof-chips">
        <ProofChip
          number="<60s"
          label={t("pages.editorialLanding.firstReply")}
          hint={t("pages.editorialLanding.firstReplyHint")}
        />
        <ProofChip
          number="+42%"
          label={t("pages.editorialLanding.replyLift")}
          hint={t("pages.editorialLanding.replyLiftHint")}
        />
        <ProofChip number="Zillow · FUB · IDX" label={t("pages.editorialLanding.yourStack")} />
      </div>
    </section>
  );
}

function ProofChip({ number, label, hint }: { number: string; label: string; hint?: string }) {
  return (
    <div className="ed-proof-chip" title={hint}>
      <span className="ed-proof-number">{number}</span>
      <span className="ed-proof-label">{label}</span>
    </div>
  );
}

// ---------- PROBLEM ----------

function ProblemSection() {
  const { t } = useTranslation("dashboard");
  return (
    <section className="ed-problem" id="problem">
      <div className="ed-container">
        <div className="ed-problem-grid">
          <div>
            <div className="ed-problem-dek">№ 03 · The problem</div>
            <h2 className="ed-problem-headline">
              {t("pages.editorialLanding.problemBefore")} {t("pages.editorialLanding.problemMid")} <em>{t("pages.editorialLanding.problemEm")}</em>
            </h2>
          </div>
          <div className="ed-problem-body">
            <p>{t("pages.editorialLanding.problemP1")}</p>
            <p className="ed-problem-pull">
              {/* [INVENTED] — cite or replace before launch */}{t("pages.dashFragments.firstAgentWins")}</p>
            <p>{t("pages.editorialLanding.problemP2")}</p>
            <p>{t("pages.editorialLanding.problemP3")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- HOW IT WORKS ----------

function HowItWorksSection() {
  const { t } = useTranslation("dashboard");
  const steps = [
    {
      num: "I",
      title: "A lead arrives.",
      detail: "Median latency: 4 seconds from source",
      body:
        "From Zillow, Realtor.com, your IDX, Facebook Lead Ads, or a form on your own site — LeadSmart catches it the moment it lands, day or night.",
    },
    {
      num: "II",
      title: "The first reply goes out.",
      detail: "Sent from your own number",
      body:
        "A text and email, written in your voice, referencing the specific property or search. Not a template blast — a real first message that earns a real reply.",
    },
    {
      num: "III",
      title: "The conversation continues.",
      detail: "You can step in at any point",
      body:
        "If they reply, LeadSmart keeps the thread warm — answering basic questions, asking qualification questions, and offering tour slots from your calendar.",
    },
    {
      num: "IV",
      title: "The warm ones come to you.",
      detail: "Hot / warm / drip, clearly marked",
      body:
        "When a lead is ready to tour or hits your qualification threshold, you get pinged. Everything — the thread, the source, the score — is waiting for you.",
    },
  ];
  return (
    <section className="ed-how" id="how">
      <div className="ed-container">
        <SectionLabel num="04" category="How it works" />
        <h2 className="ed-section-headline">
          {t("pages.editorialLanding.howBefore")} <em>{t("pages.editorialLanding.howEm")}</em>
        </h2>
        <div className="ed-how-steps">
          {steps.map((s) => (
            <div key={s.num} className="ed-how-step">
              <div className="ed-how-num">{s.num}</div>
              <div>
                <h3 className="ed-how-title">{s.title}</h3>
                <div className="ed-how-detail">{s.detail}</div>
              </div>
              <p className="ed-how-body">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- FEATURES ----------

function FeaturesSection() {
  const { t } = useTranslation("dashboard");
  return (
    <section className="ed-features" id="features">
      <div className="ed-container">
        <SectionLabel num="05" category="Features" />
        <h2 className="ed-section-headline">
          {t("pages.editorialLanding.featuresBefore")} <em>{t("pages.editorialLanding.featuresEm")}</em>
        </h2>

        <FeatureRow
          index="Feature one"
          title={
            <>{t("pages.editorialLanding.instantAi")}<em>follow-up</em>
            </>
          }
          body="Every new lead gets a personalized text and email in under 60 seconds — referencing the exact property, their search criteria, and the source. Sent from your number, in your voice."
          bullets={["SMS and email, 24 / 7", "Per-source message tuning", "Pauses the moment you reply"]}
          visualLabel="Drip preview"
          visual={<DripVisual />}
        />

        <FeatureRow
          reverse
          index="Feature two"
          title={
            <>{t("pages.editorialLanding.scoringThat")}<em>intent.</em>
            </>
          }
          body="Behavioral signals, message sentiment, tour requests, and pre-qualification language combine into a single score. You see the three leads most likely to close — and the reasons why."
          bullets={["Hot / warm / cool, with reason pills", "Priority inbox view", "No more guessing who to call first"]}
          visualLabel="Priority inbox"
          visual={<ScoringVisual />}
        />

        <FeatureRow
          index="Feature three"
          title={
            <>
              {t("pages.editorialLanding.pipelineBefore")} <em>{t("pages.editorialLanding.pipelineEm")}</em>
            </>
          }
          body="Every lead, every tour, every offer — one view. Status updates automatically as the conversation progresses. No more opening a spreadsheet on Sunday night."
          bullets={["New → Contacted → Touring → Offer", "Tour and offer milestones tracked", "Shared view for teams"]}
          visualLabel="Pipeline view"
          visual={<PipelineVisual />}
        />

        <FeatureRow
          reverse
          index="Feature four"
          title={
            <>
              {t("pages.editorialLanding.stackBefore")} <em>{t("pages.editorialLanding.stackEm")}</em>
            </>
          }
          body="Zillow, Realtor.com, Follow Up Boss, kvCORE, Sierra Interactive, your IDX, Facebook Lead Ads. Native integrations or Zapier. Setup takes fifteen minutes."
          bullets={["Native: FUB, kvCORE, Sierra", "Direct: Zillow, Realtor, Facebook", "Anything else, via Zapier"]}
          visualLabel="Integrations"
          visual={<IntegrationsVisual />}
        />
      </div>
    </section>
  );
}

function FeatureRow({
  index,
  title,
  body,
  bullets,
  visualLabel,
  visual,
  reverse,
}: {
  index: string;
  title: React.ReactNode;
  body: string;
  bullets: string[];
  visualLabel: string;
  visual: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <div className={`ed-feature-row ${reverse ? "ed-reverse" : ""}`}>
      <div>
        <div className="ed-feature-index">{index}</div>
        <h3 className="ed-feature-title">{title}</h3>
        <p className="ed-feature-body">{body}</p>
        <ul className="ed-feature-list">
          {bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </div>
      <div className="ed-feature-visual">
        <div className="ed-feature-visual-label">{visualLabel}</div>
        {visual}
      </div>
    </div>
  );
}

function DripVisual() {
  const steps = [
    { marker: "0:00", channel: "SMS · From your number", msg: "\u201CHi Sarah, this is Mark — saw you asked about 2418 Oakhurst. Hoping to tour this weekend?\u201D" },
    { marker: "0:02", channel: "Email · Personalized", msg: "Subject: About 2418 Oakhurst Dr." },
    { marker: "Day 2", channel: "SMS · Soft follow-up", msg: "\u201CQuick one — a few new listings hit today in Lakewood under 850. Want me to send the shortlist?\u201D" },
    { marker: "Day 7", channel: "Pauses on reply · Auto", msg: "Thread handed back to you the moment they respond." },
  ];
  return (
    <>
      {steps.map((s) => (
        <div className="ed-drip-step" key={s.marker}>
          <div className="ed-drip-marker">{s.marker}</div>
          <div>
            <div className="ed-drip-channel">{s.channel}</div>
            <div className="ed-drip-msg">{s.msg}</div>
          </div>
        </div>
      ))}
    </>
  );
}

function ScoringVisual() {
  const rows = [
    { name: "Sarah M.", meta: "Zillow · Weekend-ready · Pre-qual asked", score: 92, heat: "hot" },
    { name: "James W.", meta: "Realtor · 3 replies · Tour interest", score: 87, heat: "hot" },
    { name: "Lisa K.", meta: "IDX · 2 saved searches", score: 64, heat: "warm" },
    { name: "David P.", meta: "FUB · 6-month timeline", score: 31, heat: "cool" },
  ];
  return (
    <div className="ed-scoring">
      {rows.map((r) => (
        <div className="ed-scoring-row" key={r.name}>
          <div>
            <div className="ed-scoring-name">{r.name}</div>
            <div className="ed-scoring-meta">{r.meta}</div>
          </div>
          <div className={`ed-scoring-score ed-heat-${r.heat}`}>{r.score}</div>
        </div>
      ))}
    </div>
  );
}

function PipelineVisual() {
  const columns = [
    { h: "New", n: 12, cards: [{ name: "Sarah M.", sub: "Zillow · 2m" }, { name: "James W.", sub: "Realtor · 15m" }] },
    { h: "Contacted", n: 8, cards: [{ name: "Lisa K.", sub: "IDX · 1d" }, { name: "Dana R.", sub: "FUB · 2d" }] },
    { h: "Touring", n: 4, cards: [{ name: "Carlos G.", sub: "Sat 1pm" }] },
    { h: "Offer", n: 2, cards: [{ name: "The Nguyens", sub: "Counter pending" }] },
  ];
  return (
    <div className="ed-pipeline-cols">
      {columns.map((col) => (
        <div className="ed-pipeline-col" key={col.h}>
          <div className="ed-pipeline-col-head">
            <span>{col.h}</span>
            <span>{col.n}</span>
          </div>
          {col.cards.map((c) => (
            <div className="ed-pipeline-card" key={c.name}>
              <div className="ed-pipeline-card-name">{c.name}</div>
              <div className="ed-pipeline-card-sub">{c.sub}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function IntegrationsVisual() {
  const names = [
    "Zillow",
    "Realtor.com",
    "Follow Up Boss",
    "kvCORE",
    "Sierra Interactive",
    "Facebook Lead Ads",
    "Your IDX site",
    "Zapier (anything)",
  ];
  return (
    <div className="ed-integrations">
      {names.map((n) => (
        <div className="ed-integration-cell" key={n}>
          {n}
        </div>
      ))}
    </div>
  );
}

// ---------- TESTIMONIALS ----------

function TestimonialsSection() {
  const { t } = useTranslation("dashboard");
  const testimonials = [
    { text: "I closed three deals in my trial that would have ghosted me in week one.", name: "Mara Tran", role: "Windermere · Seattle" },
    // [INVENTED] — replace before launch
    { text: "I didn\u2019t hire an ISA. I hired LeadSmart. Same work, a tenth of the cost, and it never forgets to follow up.", name: "Derek Okafor", role: "Keller Williams · Phoenix" },
    // [INVENTED] — replace before launch
    { text: "My husband finally stopped asking why I\u2019m on my phone at dinner. Best $79 I spend every month.", name: "Priya Ramakrishnan", role: "eXp · Austin" },
  ];
  return (
    <section className="ed-testimonials">
      <div className="ed-container">
        <SectionLabel num="06" category="From the field" />
        <h2 className="ed-section-headline" style={{ maxWidth: 760 }}>
          {t("pages.editorialLanding.testimonialsBefore")} <em>{t("pages.editorialLanding.testimonialsEm")}</em>
        </h2>
        <div className="ed-testimonials-grid">
          {testimonials.map((t) => (
            <div key={t.name} className="ed-testimonial-card">
              <div className="ed-testimonial-mark">&ldquo;</div>
              <p className="ed-testimonial-text">{t.text}</p>
              <div className="ed-testimonial-divider" />
              <div className="ed-testimonial-meta">
                <strong>{t.name}</strong>
                {t.role}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- PRICING ----------

function PricingSection() {
  const { t } = useTranslation("dashboard");
  const tiers = [
    {
      // Internal plan key stays "free" (DB plan_type, Stripe price keys,
      // ~60 other call sites). User-facing name only → "Starter".
      name: "Starter",
      price: "$0",
      interval: "forever",
      desc: "Limited functions and usages.",
      features: ["25 leads / month", "Email follow-up only", "Pipeline dashboard", "Basic lead scoring", "1 drip sequence"],
      cta: "Get started",
      ctaHref: "/signup",
      variant: "secondary" as const,
      badge: null,
      featured: false,
    },
    {
      name: "Pro",
      price: "$79",
      interval: "per month · billed monthly",
      desc: "Full CRM and AI for active agents.",
      features: ["500 leads / month", "SMS + email AI follow-up", "Advanced lead scoring", "Unlimited drip sequences", "Tour and offer tracking", "CRM integrations"],
      cta: "Start 14-day trial",
      ctaHref: "/signup",
      variant: "primary" as const,
      badge: "Most popular",
      featured: true,
    },
    {
      name: "Elite",
      price: "$199",
      interval: "per month · billed monthly",
      desc: "For top producers closing 10+ deals a month.",
      features: ["Unlimited leads", "Priority AI routing", "Multi-channel automation", "Predictive lead scoring", "Custom drip campaigns", "Dedicated onboarding"],
      cta: "Start 14-day trial",
      ctaHref: "/signup",
      variant: "secondary" as const,
      badge: null,
      featured: false,
    },
    {
      name: "Team",
      price: "$199",
      interval: "per month · billed monthly",
      desc: "Multiple agents, one shared pipeline.",
      features: ["Up to 10 agents", "Shared lead pool and routing", "Team performance dashboard", "Admin controls", "White-label option", "Priority support SLA"],
      cta: "Contact sales",
      ctaHref: "/contact",
      variant: "secondary" as const,
      badge: null,
      featured: false,
    },
  ];
  return (
    <section className="ed-pricing" id="pricing">
      <div className="ed-container">
        <SectionLabel num="07" category="Pricing" />
        <h2 className="ed-section-headline">
          {t("pages.editorialLanding.pricingBefore")} <em>{t("pages.editorialLanding.pricingEm")}</em>
        </h2>
        <div className="ed-pricing-sub">14-day trial on Pro and Elite · Cancel anytime</div>
        <div className="ed-pricing-table">
          {tiers.map((t) => (
            <div key={t.name} className={`ed-pricing-tier ${t.featured ? "ed-featured" : ""}`}>
              {t.badge && <div className="ed-pricing-badge">{t.badge}</div>}
              <div className="ed-pricing-name">{t.name}</div>
              <div className="ed-pricing-price">
                {t.price}
                <em>/mo</em>
              </div>
              <div className="ed-pricing-interval">{t.interval}</div>
              <div className="ed-pricing-desc">{t.desc}</div>
              <ul className="ed-pricing-features">
                {t.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <a href={t.ctaHref} className={`ed-btn ed-btn-${t.variant} ed-pricing-cta`}>
                {t.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- FAQ ----------

function FAQSection() {
  const { t } = useTranslation("dashboard");
  const [openIndex, setOpenIndex] = useState(0);
  const faqs = [
    {
      q: "How does the AI follow-up actually work?",
      a: "When a new lead comes in from any source — Zillow, Realtor, Facebook, your IDX — LeadSmart sends a personalized text and email within 60 seconds. The message is tailored to where the lead came from and what they were looking at. If they reply, the AI continues the conversation, qualifies them, and hands them back to you when they're ready.",
    },
    {
      q: "Will my leads know they're talking to AI?",
      a: "Messages go out in your name, from your number, in a voice calibrated to yours. When a lead is ready to connect, you're looped in. You choose exactly how much the AI handles before you take over — some agents let it book tours directly, others want to step in the moment a lead replies. Both are fine.",
    },
    {
      q: "Does it integrate with my current CRM and website?",
      a: "Yes. Native integrations with Follow Up Boss, kvCORE, Sierra Interactive, and others. Direct feeds from Zillow, Realtor.com, and Facebook Lead Ads. Anything else, via Zapier. Setup typically takes fifteen minutes.",
    },
    {
      q: "What happens after the free trial?",
      a: "You choose a plan, or you don\u2019t. There is no auto-charge when the trial ends. If you upgrade, your leads, sequences, and history carry over. If you drop to the free tier, you keep up to 25 leads a month with core features.",
    },
    {
      q: "How is this different from a regular CRM?",
      a: "Most CRMs log what happened and wait for you to act on it. LeadSmart acts first. Instead of a reminder to follow up in two days, the follow-up already went out and the reply is waiting for you.",
    },
  ];
  return (
    <section className="ed-faq">
      <div className="ed-container">
        <SectionLabel num="08" category="Common questions" />
        <h2 className="ed-section-headline">
          {t("pages.editorialLanding.faqBefore")} <em>{t("pages.editorialLanding.faqEm")}</em>
        </h2>
        <div className="ed-faq-list">
          {faqs.map((item, i) => {
            const open = openIndex === i;
            return (
              <div key={item.q} className={`ed-faq-item ${open ? "ed-open" : ""}`}>
                <button
                  type="button"
                  className="ed-faq-q"
                  onClick={() => setOpenIndex(open ? -1 : i)}
                  aria-expanded={open}
                >
                  <span>{item.q}</span>
                  <span className="ed-faq-toggle" aria-hidden>
                    {open ? "−" : "+"}
                  </span>
                </button>
                {open && <div className="ed-faq-a">{item.a}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- FINAL CTA ----------

function FinalCTA() {
  const { t } = useTranslation("dashboard");
  return (
    <section className="ed-final">
      <div className="ed-container">
        <SectionLabel num="09" category="Start now" center />
        <h2 className="ed-final-headline">
          {t("pages.editorialLanding.finalBefore")} <em>{t("pages.editorialLanding.finalEm")}</em>
        </h2>
        <p className="ed-final-sub">
          {/* [INVENTED] — rewrite before launch */}{t("pages.dashFragments.fourteenDaysFree")}</p>
        <div className="ed-final-cta-row">
          <a href="/signup" className="ed-btn ed-btn-primary">{t("pages.editorialLanding.ctaTrial")}</a>
          <a href="#pricing" className="ed-btn ed-btn-secondary">{t("pages.editorialLanding.seePricing")}</a>
        </div>
      </div>
    </section>
  );
}

// ---------- FOOTER ----------

function Footer() {
  const { t } = useTranslation("dashboard");
  return (
    <footer className="ed-footer">
      <div className="ed-container">
        <div className="ed-footer-top">
          <div>
            <div className="ed-footer-brand">CloseBoss<em> ai</em>
            </div>
            <div className="ed-footer-tagline">{t("pages.editorialLanding.footerBlurb")}</div>
          </div>
          <FooterCol
            title={t("pages.editorialLanding.footerProduct")}
            items={[
              { label: "Features", href: "#features" },
              { label: "Pricing", href: "#pricing" },
              { label: "How it works", href: "#how" },
              { label: "Sign in", href: "/login" },
            ]}
          />
          <FooterCol
            title={t("pages.editorialLanding.footerFreeTools")}
            items={[
              { label: "Mortgage calculator", href: "/mortgage-calculator" },
              { label: "Affordability calculator", href: "/affordability-calculator" },
              { label: "Rent vs buy", href: "/rent-vs-buy-calculator" },
              { label: "Down payment", href: "/down-payment-calculator" },
            ]}
          />
          <FooterCol
            title={t("pages.editorialLanding.footerCompany")}
            items={[
              { label: "About", href: "/about" },
              { label: "Contact", href: "/contact" },
              { label: "Support", href: "/support" },
            ]}
          />
          <FooterCol
            title={t("pages.editorialLanding.footerLegal")}
            items={[
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
            ]}
          />
        </div>
        <div className="ed-footer-bottom">
          <span>© 2026 CloseBoss · All rights reserved</span>
          <span>{t("pages.editorialLanding.madeForAgents")}</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, items }: { title: string; items: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="ed-footer-col-title">{title}</div>
      <ul className="ed-footer-links">
        {items.map((i) => (
          <li key={i.label}>
            <a href={i.href}>{i.label}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Shared primitives ----------

function SectionLabel({
  num,
  category,
  center,
}: {
  num: string;
  category: string;
  center?: boolean;
}) {
  return (
    <div className={`ed-section-label ${center ? "ed-center" : ""}`}>
      <span className="ed-section-number">№ {num}</span>
      <span className="ed-section-rule" />
      <span className="ed-section-category">{category}</span>
    </div>
  );
}

// ---------- Styles ----------

function EditorialStyles() {
  // Scoped CSS via a style tag. The editorial aesthetic is intentionally isolated —
  // the in-app dashboard uses Inter + orange + SaaS patterns; mixing them is what
  // the handoff warned against.
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400&family=Inter+Tight:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

      .editorial-root { --paper:#F6F2EA; --ink:#1A1613; --accent:#8F4A2E; --rule:#D4CBC0; --muted:#5C524A; min-height:100vh; background:var(--paper); color:var(--ink); font-family:'Inter Tight', -apple-system, sans-serif; overflow-x:hidden; position:relative; }
      .editorial-root main, .editorial-root nav, .editorial-root footer { position:relative; z-index:2; }

      .paper-grain { position:fixed; inset:0; pointer-events:none; z-index:1;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.1  0 0 0 0 0.08  0 0 0 0 0.06  0 0 0 0.45 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
        mix-blend-mode: multiply; opacity:0.5;
      }

      .ed-container { max-width:1320px; margin:0 auto; padding:0 56px; }
      @media (max-width: 900px) { .ed-container { padding:0 24px; } }

      .ed-section-label { display:flex; align-items:center; gap:12px; margin-bottom:40px; }
      .ed-section-label.ed-center { justify-content:center; }
      .ed-section-number { font-family:'Fraunces', serif; font-style:italic; font-size:14px; color:var(--accent); }
      .ed-section-rule { width:32px; height:1px; background:var(--ink); display:inline-block; }
      .ed-section-category { font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); font-weight:500; }

      .ed-section-headline { font-family:'Fraunces', serif; font-variation-settings:'opsz' 144; font-weight:400; font-size:clamp(32px, 5vw, 56px); line-height:1.08; letter-spacing:-0.03em; max-width:980px; margin:0 0 40px; }
      .ed-section-headline em { font-style:italic; font-weight:300; color:var(--accent); }

      .ed-btn { font-family:inherit; font-size:14px; font-weight:500; padding:16px 26px; border-radius:0; cursor:pointer; letter-spacing:0.01em; transition:all 0.2s; border:1px solid var(--ink); display:inline-block; text-decoration:none; text-align:center; }
      .ed-btn-primary { background:var(--ink); color:var(--paper); }
      .ed-btn-primary:hover { background:var(--accent); border-color:var(--accent); transform:translateY(-1px); }
      .ed-btn-secondary { background:transparent; color:var(--ink); }
      .ed-btn-secondary:hover { background:var(--ink); color:var(--paper); }

      /* NAV + MASTHEAD */
      .ed-nav { max-width:1320px; margin:0 auto; padding:32px 56px 0; display:flex; justify-content:space-between; align-items:baseline; position:relative; z-index:2; }
      .ed-nav-logo { font-family:'Fraunces', serif; font-weight:500; font-size:22px; letter-spacing:-0.03em; }
      .ed-nav-logo em { font-style:italic; color:var(--accent); font-weight:400; }
      .ed-nav-links { display:flex; gap:28px; font-size:13px; color:var(--muted); }
      .ed-nav-links a { color:inherit; text-decoration:none; }
      .ed-nav-links a:hover { color:var(--ink); }

      .ed-masthead { max-width:1320px; margin:32px auto 0; padding:0 56px; }
      .ed-masthead-inner { border-top:1px solid var(--ink); border-bottom:1px solid var(--ink); display:flex; justify-content:space-between; padding:8px 0; font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); }

      /* HERO */
      .ed-hero { max-width:1320px; margin:0 auto; padding:72px 56px 100px; display:grid; grid-template-columns:minmax(0, 1.1fr) minmax(0, 0.9fr); gap:72px; align-items:start; }
      @media (max-width: 1024px) { .ed-hero { grid-template-columns:1fr; padding:48px 24px 72px; gap:48px; } }
      .ed-headline { font-family:'Fraunces', serif; font-variation-settings:'opsz' 144; font-weight:400; font-size:clamp(42px, 6vw, 84px); line-height:1.03; letter-spacing:-0.03em; margin:0 0 28px; position:relative; }
      .ed-headline em { font-style:italic; font-weight:300; color:var(--accent); }
      .ed-headline-flourish { display:inline-block; margin-left:4px; color:var(--accent); font-style:italic; }
      .ed-subheadline { font-size:20px; line-height:1.55; color:var(--muted); max-width:560px; margin:0 0 36px; }
      .ed-cta-row { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; }
      .ed-trust-line { font-size:13px; color:var(--muted); margin-bottom:48px; }
      .ed-trust-line .ed-sep { margin:0 10px; color:var(--rule); }

      /* HERO PHONE */
      .ed-phone-stage { position:relative; justify-self:center; }
      .ed-phone-frame { width:320px; height:640px; background:var(--ink); border-radius:44px; padding:12px; box-shadow:0 30px 60px -20px rgba(26,22,19,0.35); }
      .ed-phone-screen { width:100%; height:100%; background:#F7F4EE; border-radius:34px; position:relative; overflow:hidden; display:flex; flex-direction:column; }
      .ed-phone-notch { position:absolute; top:8px; left:50%; transform:translateX(-50%); width:110px; height:22px; background:var(--ink); border-radius:14px; }
      .ed-sms-header { border-bottom:1px solid var(--rule); padding:52px 18px 14px; display:grid; grid-template-columns:auto auto 1fr; gap:4px 10px; align-items:center; }
      .ed-sms-back { font-size:12px; color:var(--accent); grid-column:1; }
      .ed-sms-avatar { width:34px; height:34px; border-radius:50%; background:var(--accent); color:#fff; font-size:13px; font-weight:600; display:flex; align-items:center; justify-content:center; grid-column:2; grid-row:1 / 3; }
      .ed-sms-sender-name { font-weight:600; font-size:13px; grid-column:3; }
      .ed-sms-sender-sub { font-size:11px; color:var(--muted); grid-column:3; }
      .ed-sms-messages { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:8px; }
      .ed-sms-ts { font-size:10px; color:var(--muted); text-align:center; margin:6px 0 2px; font-family:'JetBrains Mono', monospace; text-transform:uppercase; letter-spacing:0.15em; }
      .ed-sms-bubble { max-width:84%; padding:10px 14px; border-radius:16px; font-size:13.5px; line-height:1.4; animation:fadeInUp .5s ease forwards; }
      .ed-sms-bubble.ed-alert { background:#FBEFE2; color:var(--ink); border:1px solid #F0D9BF; align-self:stretch; font-size:12.5px; }
      .ed-sms-bubble.ed-outbound { background:var(--accent); color:#fff; align-self:flex-end; border-bottom-right-radius:4px; }
      .ed-sms-bubble.ed-inbound { background:#E6E0D4; color:var(--ink); align-self:flex-start; border-bottom-left-radius:4px; }
      .ed-sms-system-card { background:#fff; border:1px solid var(--rule); border-radius:12px; padding:12px; box-shadow:0 6px 18px -10px rgba(26,22,19,0.18); animation:fadeInUp .5s ease forwards; }
      .ed-sms-system-head { display:flex; align-items:center; gap:8px; margin-bottom:6px; }
      .ed-sms-system-icon { width:20px; height:20px; border-radius:50%; background:var(--accent); color:#fff; font-size:12px; display:flex; align-items:center; justify-content:center; }
      .ed-sms-system-title { font-weight:600; font-size:13px; }
      .ed-sms-system-body { font-size:12px; color:var(--muted); margin-bottom:8px; }
      .ed-sms-system-actions { display:flex; gap:6px; }
      .ed-sms-btn-primary { flex:1; background:var(--ink); color:#fff; border:none; padding:8px 10px; font-size:11.5px; border-radius:6px; }
      .ed-sms-btn-secondary { flex:1; background:transparent; color:var(--ink); border:1px solid var(--rule); padding:8px 10px; font-size:11.5px; border-radius:6px; }
      .ed-sms-score-chip { background:#fff; border:1px solid var(--rule); border-radius:10px; padding:10px 12px; animation:fadeInUp .5s ease forwards; }
      .ed-sms-score-top { display:flex; justify-content:space-between; font-size:11px; margin-bottom:6px; }
      .ed-sms-score-label { color:var(--muted); font-family:'JetBrains Mono', monospace; text-transform:uppercase; letter-spacing:0.15em; }
      .ed-sms-score-hot { color:#C85A1D; font-weight:600; }
      .ed-sms-score-pills { display:flex; flex-wrap:wrap; gap:4px; }
      .ed-sms-score-pills span { background:#F1EDE4; color:var(--muted); padding:2px 8px; border-radius:10px; font-size:10px; }

      .ed-quote-card { position:absolute; left:-96px; bottom:96px; background:#FDFBF5; border:1px solid var(--rule); padding:20px 22px; width:220px; box-shadow:0 12px 30px -10px rgba(26,22,19,0.18); }
      .ed-quote-mark { font-family:'Fraunces', serif; font-size:48px; line-height:0.9; color:var(--accent); }
      .ed-quote-text { font-family:'Fraunces', serif; font-style:italic; font-size:15px; color:var(--ink); line-height:1.4; margin:4px 0 14px; }
      .ed-quote-divider { width:40px; height:1px; background:var(--ink); margin-bottom:10px; }
      .ed-quote-meta { font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.12em; color:var(--muted); }
      @media (max-width: 1024px) { .ed-quote-card { left:auto; right:-12px; bottom:-60px; } }

      .ed-phone-caption { margin-top:20px; font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); text-align:center; }

      /* DEMO */
      .ed-demo { max-width:1200px; margin:0 auto; padding:80px 56px; border-top:1px solid var(--ink); }
      @media (max-width: 900px) { .ed-demo { padding:56px 24px; } }
      .ed-video { position:relative; border:1px solid var(--ink); aspect-ratio:16/9; display:flex; align-items:center; justify-content:center; cursor:pointer; background:#EFEAE0; overflow:hidden; }
      .ed-video-runtime { position:absolute; top:16px; right:20px; font-family:'JetBrains Mono', monospace; font-size:11px; background:var(--ink); color:#fff; padding:4px 8px; letter-spacing:0.1em; }
      .ed-video-play { width:88px; height:88px; border-radius:50%; background:var(--ink); display:flex; align-items:center; justify-content:center; transition:transform .2s; }
      .ed-video:hover .ed-video-play { transform:scale(1.05); }
      .ed-video-triangle { width:0; height:0; border-left:18px solid #fff; border-top:11px solid transparent; border-bottom:11px solid transparent; margin-left:4px; }
      .ed-video-label { position:absolute; bottom:16px; left:20px; font-family:'JetBrains Mono', monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); }
      .ed-proof-chips { margin-top:40px; display:flex; gap:48px; flex-wrap:wrap; }
      .ed-proof-chip { border-top:1px solid var(--ink); padding-top:12px; min-width:200px; }
      .ed-proof-number { display:block; font-family:'Fraunces', serif; font-size:40px; font-weight:400; line-height:1; color:var(--accent); }
      .ed-proof-label { display:block; font-family:'JetBrains Mono', monospace; font-size:11px; text-transform:uppercase; letter-spacing:0.15em; color:var(--muted); margin-top:6px; }

      /* PROBLEM */
      .ed-problem { padding:100px 0; border-top:1px solid var(--ink); }
      @media (max-width: 900px) { .ed-problem { padding:64px 0; } }
      .ed-problem-grid { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1.2fr); gap:80px; align-items:start; }
      @media (max-width: 900px) { .ed-problem-grid { grid-template-columns:1fr; gap:40px; } }
      .ed-problem-dek { font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); margin-bottom:18px; }
      .ed-problem-headline { font-family:'Fraunces', serif; font-weight:400; font-size:clamp(42px, 5.5vw, 72px); line-height:1.05; letter-spacing:-0.03em; margin:0; }
      .ed-problem-headline em { font-style:italic; color:var(--accent); }
      .ed-problem-body { font-size:17px; line-height:1.7; color:var(--ink); }
      .ed-problem-body p { margin:0 0 18px; }
      .ed-problem-pull { font-family:'Fraunces', serif; font-style:italic; font-size:22px; line-height:1.45; color:var(--accent); border-left:3px solid var(--accent); padding-left:20px; margin:24px 0; }

      /* HOW */
      .ed-how { padding:100px 0; border-top:1px solid var(--ink); }
      @media (max-width: 900px) { .ed-how { padding:64px 0; } }
      .ed-how-steps { display:grid; grid-template-columns:1fr 1fr; gap:48px 80px; }
      @media (max-width: 900px) { .ed-how-steps { grid-template-columns:1fr; gap:32px; } }
      .ed-how-step { display:grid; grid-template-columns:auto 1fr; gap:16px 24px; align-items:start; border-top:1px solid var(--rule); padding-top:28px; }
      .ed-how-num { font-family:'Fraunces', serif; font-style:italic; font-size:32px; color:var(--accent); line-height:1; grid-row:1 / 3; }
      .ed-how-title { font-family:'Fraunces', serif; font-weight:500; font-size:22px; margin:0 0 4px; }
      .ed-how-detail { font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); }
      .ed-how-body { grid-column:2; font-size:15px; line-height:1.6; color:var(--muted); margin:8px 0 0; }

      /* FEATURES */
      .ed-features { padding:100px 0; border-top:1px solid var(--ink); }
      @media (max-width: 900px) { .ed-features { padding:64px 0; } }
      .ed-feature-row { display:grid; grid-template-columns:1fr 1fr; gap:80px; align-items:center; padding:60px 0; border-top:1px solid var(--rule); }
      .ed-feature-row:first-of-type { border-top:none; }
      .ed-feature-row.ed-reverse > div:first-child { order:2; }
      @media (max-width: 900px) { .ed-feature-row, .ed-feature-row.ed-reverse { grid-template-columns:1fr; gap:32px; } .ed-feature-row.ed-reverse > div:first-child { order:0; } }
      .ed-feature-index { font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); margin-bottom:12px; }
      .ed-feature-title { font-family:'Fraunces', serif; font-weight:400; font-size:40px; line-height:1.1; letter-spacing:-0.02em; margin:0 0 20px; }
      .ed-feature-title em { font-style:italic; color:var(--accent); }
      .ed-feature-body { font-size:16px; line-height:1.6; color:var(--muted); margin:0 0 20px; }
      .ed-feature-list { list-style:none; padding:0; margin:0; }
      .ed-feature-list li { position:relative; padding-left:24px; margin-bottom:10px; font-size:14px; color:var(--ink); }
      .ed-feature-list li::before { content:''; position:absolute; left:0; top:9px; width:12px; height:1px; background:var(--accent); }
      .ed-feature-visual { background:#FDFBF5; border:1px solid var(--rule); padding:24px; }
      .ed-feature-visual-label { font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); margin-bottom:16px; }

      /* Drip visual */
      .ed-drip-step { display:grid; grid-template-columns:60px 1fr; gap:16px; margin-bottom:16px; align-items:start; }
      .ed-drip-marker { font-family:'JetBrains Mono', monospace; font-size:11px; color:var(--accent); text-transform:uppercase; letter-spacing:0.1em; padding-top:2px; }
      .ed-drip-channel { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.12em; font-family:'JetBrains Mono', monospace; margin-bottom:4px; }
      .ed-drip-msg { font-family:'Fraunces', serif; font-style:italic; font-size:15px; line-height:1.5; color:var(--ink); }

      /* Scoring */
      .ed-scoring-row { display:flex; justify-content:space-between; align-items:center; padding:12px 0; border-bottom:1px solid var(--rule); }
      .ed-scoring-row:last-child { border-bottom:none; }
      .ed-scoring-name { font-weight:500; font-size:14px; }
      .ed-scoring-meta { font-size:11px; color:var(--muted); margin-top:2px; }
      .ed-scoring-score { font-family:'Fraunces', serif; font-size:28px; font-weight:400; }
      .ed-heat-hot { color:#C85A1D; }
      .ed-heat-warm { color:#B88D3A; }
      .ed-heat-cool { color:#7C8D9B; }

      /* Pipeline */
      .ed-pipeline-cols { display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; }
      .ed-pipeline-col-head { display:flex; justify-content:space-between; font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.1em; color:var(--muted); margin-bottom:8px; padding-bottom:4px; border-bottom:1px solid var(--rule); }
      .ed-pipeline-card { background:#fff; border:1px solid var(--rule); padding:8px 10px; margin-bottom:6px; }
      .ed-pipeline-card-name { font-size:12px; font-weight:500; }
      .ed-pipeline-card-sub { font-size:10px; color:var(--muted); margin-top:2px; }

      /* Integrations */
      .ed-integrations { display:grid; grid-template-columns:1fr 1fr; gap:1px; background:var(--rule); border:1px solid var(--rule); }
      .ed-integration-cell { background:#FDFBF5; padding:18px 20px; font-family:'Fraunces', serif; font-size:15px; color:var(--ink); }

      /* TESTIMONIALS */
      .ed-testimonials { padding:100px 0; border-top:1px solid var(--ink); background:#EFEAE0; }
      @media (max-width: 900px) { .ed-testimonials { padding:64px 0; } }
      .ed-testimonials-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:40px; margin-top:40px; }
      @media (max-width: 900px) { .ed-testimonials-grid { grid-template-columns:1fr; } }
      .ed-testimonial-card { background:#FDFBF5; border:1px solid var(--rule); padding:32px; }
      .ed-testimonial-mark { font-family:'Fraunces', serif; font-size:56px; line-height:0.9; color:var(--accent); }
      .ed-testimonial-text { font-family:'Fraunces', serif; font-size:20px; line-height:1.5; margin:8px 0 20px; }
      .ed-testimonial-divider { width:48px; height:1px; background:var(--ink); margin-bottom:16px; }
      .ed-testimonial-meta { font-size:13px; color:var(--muted); }
      .ed-testimonial-meta strong { display:block; color:var(--ink); font-weight:600; margin-bottom:2px; font-family:'Fraunces', serif; font-style:italic; font-size:15px; }

      /* PRICING */
      .ed-pricing { padding:100px 0; border-top:1px solid var(--ink); }
      @media (max-width: 900px) { .ed-pricing { padding:64px 0; } }
      .ed-pricing-sub { font-size:14px; color:var(--muted); margin-bottom:40px; }
      .ed-pricing-table { display:grid; grid-template-columns:repeat(4, 1fr); gap:0; border:1px solid var(--ink); }
      @media (max-width: 1100px) { .ed-pricing-table { grid-template-columns:repeat(2, 1fr); } }
      @media (max-width: 600px) { .ed-pricing-table { grid-template-columns:1fr; } }
      .ed-pricing-tier { padding:36px 28px; border-right:1px solid var(--ink); background:#FDFBF5; position:relative; display:flex; flex-direction:column; }
      .ed-pricing-tier:last-child { border-right:none; }
      .ed-pricing-tier.ed-featured { background:var(--ink); color:var(--paper); }
      .ed-pricing-tier.ed-featured .ed-pricing-features li::before { background:var(--paper); }
      .ed-pricing-badge { position:absolute; top:-12px; left:28px; background:var(--accent); color:#fff; font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.15em; padding:4px 10px; }
      .ed-pricing-name { font-family:'Fraunces', serif; font-size:24px; margin-bottom:12px; }
      .ed-pricing-price { font-family:'Fraunces', serif; font-size:56px; font-weight:400; line-height:1; }
      .ed-pricing-price em { font-family:'Inter Tight', sans-serif; font-style:normal; font-size:16px; font-weight:400; color:var(--muted); margin-left:4px; }
      .ed-pricing-tier.ed-featured .ed-pricing-price em { color:var(--rule); }
      .ed-pricing-interval { font-size:12px; color:var(--muted); margin:8px 0 20px; }
      .ed-pricing-tier.ed-featured .ed-pricing-interval { color:var(--rule); }
      .ed-pricing-desc { font-family:'Fraunces', serif; font-style:italic; font-size:16px; margin-bottom:24px; }
      .ed-pricing-features { list-style:none; padding:0; margin:0 0 32px; flex:1; }
      .ed-pricing-features li { position:relative; padding-left:22px; margin-bottom:10px; font-size:14px; }
      .ed-pricing-features li::before { content:''; position:absolute; left:0; top:9px; width:10px; height:1px; background:var(--accent); }
      .ed-pricing-cta { width:100%; }
      .ed-pricing-tier.ed-featured .ed-btn-secondary { color:var(--paper); border-color:var(--paper); }
      .ed-pricing-tier.ed-featured .ed-btn-secondary:hover { background:var(--paper); color:var(--ink); }

      /* FAQ */
      .ed-faq { padding:100px 0; border-top:1px solid var(--ink); }
      @media (max-width: 900px) { .ed-faq { padding:64px 0; } }
      .ed-faq-list { border-top:1px solid var(--ink); max-width:860px; }
      .ed-faq-item { border-bottom:1px solid var(--rule); }
      .ed-faq-q { width:100%; background:transparent; border:none; padding:24px 0; display:flex; justify-content:space-between; align-items:center; font-family:'Fraunces', serif; font-size:22px; font-weight:400; cursor:pointer; text-align:left; color:var(--ink); }
      .ed-faq-q:hover { color:var(--accent); }
      .ed-faq-toggle { font-family:'Fraunces', serif; font-size:28px; color:var(--accent); flex-shrink:0; margin-left:24px; }
      .ed-faq-a { padding:0 0 28px; font-size:15px; line-height:1.6; color:var(--muted); max-width:680px; }

      /* FINAL CTA */
      .ed-final { padding:120px 0; border-top:1px solid var(--ink); background:var(--ink); color:var(--paper); text-align:center; }
      @media (max-width: 900px) { .ed-final { padding:72px 0; } }
      .ed-final .ed-section-number { color:var(--accent); }
      .ed-final .ed-section-rule { background:var(--paper); }
      .ed-final .ed-section-category { color:var(--rule); }
      .ed-final-headline { font-family:'Fraunces', serif; font-weight:400; font-size:clamp(42px, 6vw, 80px); line-height:1.05; letter-spacing:-0.03em; margin:0 0 20px; }
      .ed-final-headline em { font-style:italic; color:var(--accent); }
      .ed-final-sub { font-size:17px; line-height:1.6; max-width:620px; margin:0 auto 40px; color:var(--rule); }
      .ed-final-cta-row { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; }
      .ed-final .ed-btn-primary { background:var(--paper); color:var(--ink); border-color:var(--paper); }
      .ed-final .ed-btn-primary:hover { background:var(--accent); color:#fff; border-color:var(--accent); }
      .ed-final .ed-btn-secondary { color:var(--paper); border-color:var(--paper); }
      .ed-final .ed-btn-secondary:hover { background:var(--paper); color:var(--ink); }

      /* FOOTER */
      .ed-footer { padding:64px 0 40px; border-top:1px solid var(--ink); background:var(--paper); }
      .ed-footer-top { display:grid; grid-template-columns:1.6fr 1fr 1fr 1fr 1fr; gap:32px; padding-bottom:40px; border-bottom:1px solid var(--rule); }
      @media (max-width: 900px) { .ed-footer-top { grid-template-columns:1fr 1fr; } }
      .ed-footer-brand { font-family:'Fraunces', serif; font-weight:500; font-size:22px; letter-spacing:-0.03em; }
      .ed-footer-brand em { font-style:italic; color:var(--accent); font-weight:400; }
      .ed-footer-tagline { font-size:14px; color:var(--muted); line-height:1.5; margin-top:12px; max-width:280px; }
      .ed-footer-col-title { font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); margin-bottom:12px; }
      .ed-footer-links { list-style:none; padding:0; margin:0; }
      .ed-footer-links li { margin-bottom:8px; }
      .ed-footer-links a { color:var(--ink); text-decoration:none; font-size:14px; }
      .ed-footer-links a:hover { color:var(--accent); }
      .ed-footer-bottom { display:flex; justify-content:space-between; padding-top:24px; font-family:'JetBrains Mono', monospace; font-size:10px; text-transform:uppercase; letter-spacing:0.2em; color:var(--muted); flex-wrap:wrap; gap:12px; }

      @keyframes fadeInUp { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
      @media (prefers-reduced-motion: reduce) { * { animation:none !important; } }
    `}</style>
  );
}
