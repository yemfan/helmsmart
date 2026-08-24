import { SETTINGS_GUIDES } from "./settings-guides";

/**
 * Help guides — short how-to articles for /help/guides/[slug].
 *
 * Each guide produces an Article + HowTo JSON-LD payload so it
 * can earn rich-result eligibility on long-tail "how do I X with
 * CloseBoss" queries. Content is intentionally concise — the goal
 * is a useful first-result answer, not an exhaustive manual.
 *
 * Adding a guide: pick a slug that matches the search query the
 * agent would type, write 4–7 numbered steps, keep `body`
 * paragraphs short, and link to the relevant in-app surface so
 * readers can act immediately.
 */

export type HelpCategory =
  | "setup"
  | "lead-capture"
  | "communication"
  | "deals"
  | "ai-and-voice"
  | "analysis"
  | "calculators"
  | "marketing"
  | "workflows"
  | "coaching"
  | "account";

export type HelpGuide = {
  slug: string;
  title: string;
  /** Meta description + OG description. Keep under 160 chars. */
  description: string;
  /** Estimated read/do time (e.g. "3 min"). */
  readTime: string;
  /** Sub-section under which this guide is grouped on /help. */
  category: HelpCategory;
  /** Intro paragraph(s) shown above the steps. */
  body: string[];
  /** Numbered steps. Each is a short instruction sentence. */
  steps: string[];
  /**
   * Optional screenshots of the surface the guide describes. Rendered under
   * the steps. `src` is a path under /public.
   */
  images?: Array<{ src: string; alt: string; caption?: string }>;
  /** Optional related links shown under the steps. */
  related?: Array<{ label: string; href: string }>;
};

export const HELP_GUIDES: ReadonlyArray<HelpGuide> = [
  {
    slug: "ai-followup-setup",
    title: "Set up AI follow-up for new leads",
    description:
      "Configure CloseBoss AI to reply to every new lead within 60 seconds — pick a review policy, edit a template, and you're live.",
    readTime: "3 min",
    category: "setup",
    body: [
      "AI follow-up is the heart of CloseBoss. Once it's running, every new lead — from your website, Zillow, Facebook, missed calls — gets a personalized SMS + email response within 60 seconds, even at 11pm on a Sunday.",
      "Setup is a single decision (auto-send vs require approval) plus optional template tweaks. Most agents are live in under 10 minutes.",
    ],
    steps: [
      "Open Settings → Messages and pick a Review Policy. Auto-send fires the first reply immediately; Require approval drops the draft into your inbox first.",
      "Open Templates. The prebuilt 'New buyer lead' and 'New seller lead' sequences cover most cases — review the copy and update the agent name / signature placeholder.",
      "Optional: Open Settings → Voice & Style and set how formal the AI sounds (Professional / Friendly / Direct) and how quickly it should escalate to you.",
      "Send a test lead through your form to confirm the sequence fires. Replies should land in your dashboard inbox within 60 seconds.",
      "Connect your real lead sources via Settings → Channels & Compliance (Zillow, Facebook, website forms). New leads from those sources start flowing through the same sequences automatically.",
    ],
    related: [
      { label: "How AI follow-up works (FAQ)", href: "/help/faq#ai_followup" },
      { label: "Set up missed-call text-back", href: "/help/guides/missed-call-text-back" },
    ],
  },
  {
    slug: "lead-import",
    title: "Import contacts from another CRM",
    description:
      "Bring your existing contacts and pipeline into CloseBoss via CSV — duplicate-aware, one-click rollback if anything looks wrong.",
    readTime: "4 min",
    category: "setup",
    body: [
      "If you're switching from Follow Up Boss, kvCORE, or any other CRM, you can bring your full contact list into CloseBoss in one CSV upload. The import is duplicate-aware (matched by email + phone), so re-running it after a fix-up won't double your contacts.",
      "Most agents import in a single pass; if you want to validate first, we recommend importing 10 test rows, confirming the field mapping looks right, and then running the full file.",
    ],
    steps: [
      "Export your contacts from your current CRM as a CSV. Most CRMs put this under Settings → Data → Export.",
      "In CloseBoss, open Settings → Data & Tools and click Import contacts.",
      "Upload the CSV. CloseBoss auto-detects standard columns (Name, Email, Phone, City, Notes); review the mapping for any custom fields.",
      "Run the import. Duplicates are merged into existing rows; new contacts are created with lifecycle_stage='lead'.",
      "Confirm the count on your Contacts page matches the row count of your CSV. If anything looks wrong, click Undo last import within 24 hours to roll the entire batch back.",
    ],
    related: [
      { label: "Which CRMs do you integrate with?", href: "/help/faq#integrations" },
    ],
  },
  {
    slug: "coaching-enrollment",
    title: "Manage your CloseBoss Coaching enrollment",
    description:
      "Enroll, opt out, or re-enroll in Producer Track and Top Producer Track from one settings panel. Auto-enrollment respects prior opt-outs.",
    readTime: "2 min",
    category: "coaching",
    body: [
      "Coaching is auto-enrolled when you upgrade to a plan that includes a program — Producer Track on Pro+, Top Producer Track on Premium and Team. You can opt out at any time, and we won't re-enroll you silently. To re-enroll later, take an explicit action from the same panel.",
    ],
    steps: [
      "Open Settings → Coaching.",
      "Each program your plan can access shows the current state: Enrolled, Eligible — not enrolled, or Opted out.",
      "To start a program, click Enroll (or Re-enroll if you opted out before). Your dashboard tasks + weekly playbooks start tracking the program's annual transaction target immediately.",
      "To stop a program, click Opt out. Optional: leave a short note about why — it helps us improve the program. We won't re-enroll you automatically after that.",
    ],
    related: [
      { label: "What is CloseBoss Coaching?", href: "/agent/coaching" },
      { label: "Coaching FAQ", href: "/help/faq#coaching" },
    ],
  },
  {
    slug: "bba-workflow",
    title: "Use the Buyer Broker Agreement (BBA) workflow",
    description:
      "Capture a signed BBA before tours so every showing is compensated. Track status from request to signature inside the deal record.",
    readTime: "3 min",
    category: "deals",
    body: [
      "Post-NAR settlement, every brokerage needs a Buyer Broker Agreement signed before showing homes. CloseBoss's BBA workflow makes that a one-click step on the deal record — generate the agreement, send it for e-signature, and watch the status flip when the buyer signs.",
    ],
    steps: [
      "Open the deal (or buyer contact). In the deal sidebar, click Buyer Broker Agreement → Send for signature.",
      "Pre-fill the buyer name, agent name, commission terms (defaults pulled from Settings → Channels & Compliance → Commission defaults), and any custom clauses.",
      "Choose your e-signature provider (Dotloop or DocuSign). The agreement sends to the buyer's email immediately.",
      "Track status on the deal record. The BBA badge moves through Requested → Signed automatically when the buyer completes the signature.",
      "After signature, the deal record is unlocked for tour scheduling. Pre-signature, tour booking surfaces a soft warning so you don't accidentally show without a signed BBA.",
    ],
    related: [
      { label: "How we compare on BBA workflow", href: "/agent/compare" },
    ],
  },
  {
    slug: "video-email",
    title: "Record and send video email",
    description:
      "Send a personalized 60-second video to any lead or client without leaving CloseBoss. Track plays + completion rate inside the contact.",
    readTime: "2 min",
    category: "communication",
    body: [
      "Video email lifts response rates significantly — buyers and sellers feel they know you before the first call. CloseBoss records and hosts video natively (no extensions, no upload step) and tracks who watched and how much.",
    ],
    steps: [
      "Open any contact and click Message → Video.",
      "Record in your browser. The first time, your browser will ask for camera + microphone permission.",
      "Trim the start/end if you want, or re-record. Most effective videos run 30–60 seconds.",
      "Add a written subject line + short message; the video embeds inline in the email body for the recipient.",
      "Click Send. You'll see a Watch event in the contact timeline when the recipient plays it, plus a percentage-watched metric so you know how engaged they are.",
    ],
    related: [
      { label: "Video email vs the rest", href: "/agent/compare" },
    ],
  },
  {
    slug: "missed-call-text-back",
    title: "Set up missed-call text-back",
    description:
      "Auto-text inbound callers when you can't pick up. Forward calls to your mobile and never lose a hot lead to voicemail again.",
    readTime: "3 min",
    category: "setup",
    body: [
      "Missed-call text-back is the highest-ROI feature for solo agents — when a caller reaches voicemail and no human, they usually call the next agent on the list. With CloseBoss, the moment a call goes unanswered, an SMS goes out automatically.",
    ],
    steps: [
      "Open Settings → Voice & Style → Missed Call Text-Back.",
      "Pick the CloseBoss number you want callers to dial. (If you don't have one yet, Settings → Channels & Compliance → Phone numbers will provision one in your area code.)",
      "Set up call forwarding from that number to your personal mobile so you can pick up live when you're available.",
      "Customize the auto-text. The default — 'Sorry I missed you! Are you calling about [property]?' — works well; agents who personalize it see noticeably higher reply rates.",
      "Ring duration: keep it short (12–15 seconds) so callers don't sit on hold. The auto-text fires within 60 seconds of the missed call.",
    ],
  },

  /* ─────────── Getting started (additional) ─────────── */
  {
    slug: "phone-number-setup",
    title: "Provision a CloseBoss phone number",
    description:
      "Get a local CloseBoss number for inbound calls, missed-call text-back, and outbound texting — provisioned in your area code in under five minutes.",
    readTime: "3 min",
    category: "setup",
    body: [
      "Every CloseBoss workspace gets a dedicated phone number for SMS + voice. The number is what powers missed-call text-back, AI voice answering, and outbound texts that don't trip carrier spam filters.",
      "Provisioning is automatic — pick an area code, accept the carrier terms, and you're live. You can keep your personal number for direct contacts; CloseBoss's number sits in front of it as the public-facing line.",
    ],
    steps: [
      "Open Settings → Channels & Compliance → Phone numbers.",
      "Click Provision number. Enter your area code (the default uses your office ZIP code).",
      "Accept the A2P 10DLC carrier terms — this registers the number for SMS and unlocks higher daily message limits.",
      "Optional: enable Call forwarding to your personal mobile so live calls ring through to you. Toggle Voice AI on if you want the AI to answer when you don't pick up.",
      "Add the new number to your email signature, business card, and website — use it as your public real-estate number going forward.",
    ],
    related: [
      { label: "Set up missed-call text-back", href: "/help/guides/missed-call-text-back" },
      { label: "Configure voice AI for inbound calls", href: "/help/guides/voice-ai-inbound" },
    ],
  },
  {
    slug: "team-seats",
    title: "Invite a team member or assistant",
    description:
      "Add a teammate, ISA, transaction coordinator, or admin to your CloseBoss workspace. Each seat gets role-scoped access.",
    readTime: "3 min",
    category: "setup",
    body: [
      "If you work with an assistant, an ISA, or a partner agent, you can give them their own login with scoped access. They see the leads and deals you assign to them, plus shared resources like templates and playbooks.",
    ],
    steps: [
      "Open Settings → Team.",
      "Click Invite member. Enter the email and pick a role: Agent (full deal access), ISA (lead-queue + outbound only), Coordinator (deals + tasks, no marketing), or Admin (billing + settings).",
      "Optional: scope by Smart List — useful if you want the ISA to only work the buyer-side leads, for example.",
      "Send the invite. They get an email with a one-click signup link that already routes to your workspace.",
      "Reassign existing leads/deals to the new member from Contacts → Bulk Actions → Reassign owner.",
    ],
  },

  /* ─────────── Lead capture & generation ─────────── */
  {
    slug: "lead-queue-triage",
    title: "Work the Lead Queue",
    description:
      "Triage new inbound leads in under 30 seconds each — claim, qualify, and route to the right follow-up sequence.",
    readTime: "3 min",
    category: "lead-capture",
    body: [
      "The Lead Queue is where new inbound leads land before they're assigned. If you're a solo agent, AI auto-claims everything for you; if you have a team, this is where ISAs work down the daily queue.",
      "Triage shouldn't take more than 30 seconds per lead — the AI has already drafted a first response, so your job is to confirm the response went out and decide what sequence to run next.",
    ],
    steps: [
      "Open Leads → Lead Queue from the sidebar.",
      "Each card shows the lead source, the first message that went out, and the AI's qualification score (Hot / Warm / Cool).",
      "Click Claim to take ownership. The lead moves into your Contacts and the AI follow-up sequence continues running.",
      "If the lead is clearly not real (test submissions, junk emails), click Mark as spam — it suppresses further outreach and trains the lead-quality model.",
      "For high-intent leads, click Call now — the dialer fires immediately with the lead's number and a one-page context summary so you can dial fully briefed.",
    ],
    related: [
      { label: "Set up AI follow-up", href: "/help/guides/ai-followup-setup" },
    ],
  },
  {
    slug: "open-house-signup",
    title: "Run an open house with auto-capture",
    description:
      "Use the open-house signup page to capture every visitor's contact info on their phone — no clipboard, no lost leads.",
    readTime: "4 min",
    category: "lead-capture",
    body: [
      "Open houses are still one of the highest-quality lead sources in residential — but only if you actually capture the contact. The CloseBoss open-house flow gives every visitor a QR code that opens a phone-optimized signup page, and adds them to the CRM the moment they tap Submit.",
    ],
    steps: [
      "Open Leads → Open Houses → Create open house. Pick the property (or add the address manually), date, and your hosting agent name.",
      "Print the auto-generated QR code (it links to a signup page branded with the property photo and your name).",
      "At the open house, ask each visitor to scan and sign in on their phone — most do, since it's faster than writing on a clipboard.",
      "Visitors land in your Contacts immediately, tagged with the open-house source and the property. AI follow-up fires the first message within 60 seconds of their submission.",
      "After the open house, open the event in CloseBoss and add a quick note per visitor (hot, lukewarm, looking just for fun) — these notes feed the lead-qualification model and shape the next-step sequence.",
    ],
    related: [
      { label: "Run the post-open-house follow-up sequence", href: "/help/guides/post-open-house-followup" },
    ],
  },
  {
    slug: "post-open-house-followup",
    title: "Run the post–open house follow-up sequence",
    description:
      "Convert open-house visitors into appointments with a 5-touch AI sequence — same-day text, next-day video email, listing alerts.",
    readTime: "3 min",
    category: "lead-capture",
    body: [
      "Visitors who sign in at an open house are golden — they showed up, they're actively looking, and they know you by name. The default CloseBoss post–open house sequence is a 5-touch, 7-day cadence designed to convert them to an appointment.",
    ],
    steps: [
      "When you create an open house, the Post–Open House sequence auto-attaches to every signup. No extra setup required.",
      "Touch 1 (same day, ~30 min after they leave): Thanks-for-coming SMS + the listing PDF.",
      "Touch 2 (next morning): Personalized video email recapping the property and asking what they'd like to see next.",
      "Touch 3 (day 3): MLS listing alert with 3 comparable homes in the area.",
      "Touch 4 (day 5): Direct ask — 'Would you like to schedule a tour?' — sent at the time of day they engaged most.",
      "Touch 5 (day 7): Sphere drop into the long-term nurture if no engagement. They stay on monthly market-update emails.",
      "Edit the sequence in Templates → Sequences → Post–Open House if you want to change copy or timing.",
    ],
  },
  {
    slug: "generate-leads-ai-content",
    title: "Generate listing social posts with AI",
    description:
      "Auto-draft Instagram + Facebook posts for any listing — captions, hashtags, and image overlays — from one screen.",
    readTime: "3 min",
    category: "lead-capture",
    body: [
      "The Generate Leads feature drafts ready-to-post social content for your active listings. The AI pulls property details (price, beds, baths, key features) and produces three caption variants per post — short hook, story style, and bullet-list — plus suggested hashtags scoped to your local market.",
    ],
    steps: [
      "Open Leads → Generate Leads → New post.",
      "Pick the listing from your Listings library, or paste an MLS link to pull the details automatically.",
      "Select the platform mix (Instagram, Facebook, LinkedIn, or all three).",
      "Review the three caption variants. Edit any copy in place, or click Regenerate for new options.",
      "Click Publish to post immediately, or Schedule to queue posts across the next 7 days at the engagement-optimal time for each platform.",
    ],
    related: [
      { label: "Marketing plans", href: "/help/guides/marketing-plans" },
    ],
  },
  {
    slug: "home-value-leads",
    title: "Capture home-value leads from your IDX site",
    description:
      "Embed the CloseBoss home-value widget on any page to capture seller leads with an AI-generated CMA preview.",
    readTime: "3 min",
    category: "lead-capture",
    body: [
      "Home-value pages are the single best seller-lead generator. The CloseBoss widget lets visitors enter their address, see a teaser estimate, and submit their email for the full report — which is auto-generated as an AI CMA snapshot you can follow up on.",
    ],
    steps: [
      "Open Settings → Channels & Compliance → Widgets → Home Value Widget.",
      "Customize the widget: branded color, your photo, and the lead-magnet copy ('Get your home's current market value, instantly').",
      "Copy the embed snippet (one line of JavaScript) and paste it into your IDX site or landing page.",
      "When a visitor submits their address, they get an instant teaser estimate; the full CMA arrives by email moments later.",
      "Submissions land in Contacts as seller leads, tagged with the source 'Home Value Widget' and the requested property — AI follow-up fires automatically.",
    ],
    related: [
      { label: "Smart CMA Builder", href: "/help/guides/smart-cma-builder" },
    ],
  },

  /* ─────────── Conversations & messaging ─────────── */
  {
    slug: "conversations-inbox",
    title: "Run your day from the Conversations inbox",
    description:
      "Triage SMS, email, voicemails, and AI drafts from one inbox. Filters, bulk actions, and keyboard shortcuts for fast clearing.",
    readTime: "4 min",
    category: "communication",
    body: [
      "The Conversations inbox is the daily home base. It unifies SMS, email, voicemails, and AI-drafted replies awaiting your approval into one feed, sorted by urgency.",
    ],
    steps: [
      "Open Communicate → Conversations from the sidebar.",
      "Use the filter pills at the top to narrow: Needs reply, AI drafts, Hot leads, Last 24h.",
      "Click any thread to see the full history — SMS, email, calls — alongside the contact's deal status and lead source.",
      "Reply directly with text, voice message, or a quick template (press '/' to insert a template).",
      "Press 'e' to archive, 'r' to mark as needs reply, or 'a' to assign to a teammate. Keyboard shortcuts work across the whole inbox.",
      "For AI drafts on Require approval policy, click Approve to send as-is, Edit & send to tweak first, or Discard to delete.",
    ],
    related: [
      { label: "Set up AI follow-up", href: "/help/guides/ai-followup-setup" },
    ],
  },
  {
    slug: "templates",
    title: "Build SMS & email templates that don't sound like spam",
    description:
      "Create reusable templates with merge tags, test them, and let the AI personalize them per contact at send time.",
    readTime: "3 min",
    category: "communication",
    body: [
      "Templates speed up the repetitive 80% of messaging — first-touch replies, scheduling, follow-ups after a showing. CloseBoss templates support merge tags (first name, property address, agent signature) and an optional AI personalization layer that rewrites the body to match the contact's voice and history.",
    ],
    steps: [
      "Open Communicate → Templates → New template.",
      "Pick the channel (SMS, email, or both) and the use case (first touch, showing follow-up, listing presentation invite, etc.).",
      "Write the template using {{first_name}}, {{property_address}}, {{agent_name}} merge tags. The preview pane shows what it looks like for a sample contact.",
      "Toggle AI personalization on if you want the AI to rewrite the body per-recipient based on their conversation history. It keeps the structure and intent but tunes the tone.",
      "Save and test: from the template editor, click Send test on a real contact (it sends from your number, charged to your usage).",
      "Templates auto-show up as quick-insert options in the inbox compose box.",
    ],
  },
  {
    slug: "drafts",
    title: "Approve or edit AI drafts before they send",
    description:
      "If you run AI follow-up on Require approval, every drafted reply lands here. Triage in batches; approve, edit, or discard with one click.",
    readTime: "2 min",
    category: "communication",
    body: [
      "Require approval policy keeps a human in the loop on every AI-drafted message. Drafts queue up in one screen so you can clear them in a 10-minute morning batch instead of being pinged all day.",
    ],
    steps: [
      "Open Communicate → Drafts.",
      "Drafts are grouped by contact, with the AI's reasoning shown inline (e.g. 'Buyer asked about inspections — drafted a reply with the inspection contingency clause').",
      "Click Approve to send as-is. Click Edit & send to tweak first.",
      "Click Discard if the draft is off — and add a one-line reason. The feedback feeds back into the AI's drafting model for your account.",
      "Once your inbox is at zero drafts daily, consider switching to Auto-send. Most agents move to auto after their first 2–3 weeks of approval reviews.",
    ],
  },
  {
    slug: "marketing-plans",
    title: "Run a 30-day marketing plan for a new listing",
    description:
      "Auto-schedule the full marketing rollout for a listing — photos, social, video, email blast, just-listed postcards.",
    readTime: "4 min",
    category: "marketing",
    body: [
      "When a new listing goes live, you want a coordinated 30-day push, not five disconnected to-dos. The Marketing Plan template assembles the full rollout — pro photos, just-listed social posts, agent-to-agent email blast, postcard mailer, open house, broker tour — in one click, with each item scheduled and assigned.",
    ],
    steps: [
      "Open Communicate → Marketing Plans → New plan.",
      "Pick the listing. The Just Listed (30-day) template auto-populates with every standard task on a recommended timeline.",
      "Review each item and customize: change the dates, swap the social copy variants, edit the postcard front, or remove items that don't apply.",
      "Approve the plan. Each task lands on your calendar with the right lead time — photo shoot the day after launch, social blast 24h later, postcards 5 days in.",
      "Track progress on the Plan dashboard. Items auto-complete as the underlying action fires (social post published, email sent, postcard rendered to print).",
    ],
    related: [
      { label: "Postcard mailers", href: "/help/guides/postcard-mailers" },
    ],
  },
  {
    slug: "postcard-mailers",
    title: "Send postcard mailers (just-listed, just-sold, neighborhood)",
    description:
      "Drag-and-drop postcard designer with prebuilt just-listed / just-sold / market-update templates. Mailed by USPS via integrated print.",
    readTime: "3 min",
    category: "marketing",
    body: [
      "Postcards still convert in residential — especially on geographic farms. CloseBoss has a built-in designer + integrated print/mail vendor, so you can send a Just Listed or Just Sold postcard to 200 nearby homes in under 10 minutes without leaving the dashboard.",
    ],
    steps: [
      "Open Communicate → Postcards → New mailer.",
      "Pick a template: Just Listed, Just Sold, Market Update, or Custom. Each pulls listing photos + your branding automatically.",
      "Pick the recipient list: a saved Smart List (e.g. your geographic farm), a custom radius around the listing, or a CSV upload.",
      "Preview the front and back. Edit the copy inline or upload a custom design.",
      "Approve and pay — postcards drop at USPS within 48 hours, typically arrive 3–5 business days later. Tracking shows when each card hit the mail stream.",
    ],
  },

  /* ─────────── AI & voice features ─────────── */
  {
    slug: "voice-ai-inbound",
    title: "Configure voice AI to answer inbound calls",
    description:
      "Let the voice AI pick up when you can't — it qualifies the caller, books a callback, and writes the CRM note for you.",
    readTime: "4 min",
    category: "ai-and-voice",
    body: [
      "Voice AI is the next step beyond missed-call text-back: instead of just sending an SMS when you miss a call, the AI answers the phone, has a real conversation, qualifies the caller, and books a callback into your calendar. Callers reach a human-sounding agent in your voice; you wake up to a clean CRM note.",
      "It's especially powerful for after-hours and weekend coverage — every call gets answered, even if you're showing a property or asleep.",
    ],
    steps: [
      "Open Settings → Voice & Style → Voice AI.",
      "Pick your AI voice: pre-recorded studio voices, or upload 30 seconds of your own voice for a custom clone (Premium plans).",
      "Configure the opener — what the AI says when it picks up. Default: 'Hi, this is [Your Name]'s assistant — they're with a client right now, can I help?'",
      "Set the goal: book a callback, qualify the lead, send a property packet, or escalate to a live transfer.",
      "Set call-routing rules: answer-after rings (default 4), business hours vs after hours, transfer-to-human keywords ('I need to talk to a person').",
      "Toggle Voice AI on. Test it by calling your CloseBoss number from a phone you don't normally call from. The full transcript lands in Conversations with the contact's qualification summary.",
    ],
    related: [
      { label: "Test-drive the voice AI", href: "/voice-ai-test-drive" },
      { label: "Set up missed-call text-back", href: "/help/guides/missed-call-text-back" },
    ],
  },
  {
    slug: "ai-voice-style",
    title: "Tune the AI's writing voice and tone",
    description:
      "Set how the AI drafts messages — professional, friendly, or direct — and what topics it should always escalate to you.",
    readTime: "2 min",
    category: "ai-and-voice",
    body: [
      "Out of the box, the AI defaults to a friendly-professional tone. You can tune this two ways: a style slider that affects every message, and a set of escalation rules for topics the AI shouldn't decide on alone.",
    ],
    steps: [
      "Open Settings → Voice & Style → Drafting voice.",
      "Pick a tone: Professional, Friendly, or Direct. Optional: upload 2–3 sample messages you've written and click Train from samples — the AI learns your phrasing patterns.",
      "Under Escalation rules, add topics that should always go to you instead of auto-replying: 'price negotiation,' 'legal questions,' 'specific contract terms.' These flag the message as Needs reply.",
      "Save. New drafts use the new voice immediately; in-flight sequences keep their existing copy.",
    ],
  },
  {
    slug: "deal-coach",
    title: "Use the AI Deal Coach for next-step suggestions",
    description:
      "The Deal Coach reviews every active deal nightly and surfaces the one next action that's most likely to move it forward.",
    readTime: "3 min",
    category: "ai-and-voice",
    body: [
      "The Deal Coach is the CloseBoss sidekick that watches your pipeline overnight and surfaces a prioritized to-do list each morning. It reads every active deal's history — last touchpoint, days since contact, what's blocking progression — and suggests the single highest-leverage next action.",
    ],
    steps: [
      "Open Insights → Coaching from the sidebar.",
      "The top of the screen shows today's prioritized actions: 'Call back Sarah Chen — quiet for 14 days, was hot,' 'Send updated CMA to Mark Davis — listing presentation tomorrow,' etc.",
      "Click any action to see the Deal Coach's reasoning (what data points it used to surface this).",
      "Click Do now to jump to the action surface (inbox compose, dialer, CMA builder). Or click Snooze to push it 1 day / 3 days / next week.",
      "Mark actions Complete as you finish them. Completed items train the model on which suggestions actually help you.",
    ],
    related: [
      { label: "Performance dashboard", href: "/help/guides/performance-dashboard" },
    ],
  },

  /* ─────────── Deal workflows ─────────── */
  {
    slug: "showings",
    title: "Schedule showings and capture feedback",
    description:
      "Schedule tours, send confirmations, and capture per-property feedback from buyers in one workflow.",
    readTime: "3 min",
    category: "deals",
    body: [
      "The Showings tracker is where buyer-side activity lives. Each tour is a row with the property, scheduled time, buyer attendees, and a structured feedback form the buyer completes after — feeding both the contact record and your seller-side reporting.",
    ],
    steps: [
      "Open Buyers → Showings → New showing. Pick the buyer (creates a contact if new), the property (from MLS or manual), and the date/time.",
      "Optional: enable Pre-tour BBA check — if no signed Buyer Broker Agreement exists, you'll get a soft warning before confirmation.",
      "Send the confirmation. The buyer gets an SMS with the address, time, and a link to the auto-generated property packet.",
      "After the showing, the buyer gets a link to a 60-second feedback form: 1–5 rating, what they liked, what they didn't, would they make an offer.",
      "Feedback lands on both the contact timeline and (if the listing is yours) the seller report — so sellers get real-time buyer signal without you typing it up.",
    ],
    related: [
      { label: "Use the BBA workflow", href: "/help/guides/bba-workflow" },
    ],
  },
  {
    slug: "offers",
    title: "Manage buyer offers from draft to acceptance",
    description:
      "Draft offers, send for e-signature, track counter-offers, and move accepted offers into the transaction workflow.",
    readTime: "4 min",
    category: "deals",
    body: [
      "The Offers tracker handles the buyer-side offer lifecycle: drafting, sending for signature, receiving counters, and rolling acceptance into a full transaction record. It eliminates the email-back-and-forth of attached PDFs and version mismatches.",
    ],
    steps: [
      "Open Buyers → Offers → New offer. Pick the buyer and the property; the form pre-fills standard local contract fields.",
      "Fill in the offer terms: price, earnest money, financing, contingencies, closing date.",
      "Click Generate document — the offer is auto-rendered to your local state contract template.",
      "Send for e-signature (Dotloop or DocuSign). The buyer signs first, then the offer routes to the listing agent.",
      "Track status: Drafted → Sent → Signed by buyer → Sent to listing → Accepted / Countered / Rejected.",
      "On acceptance, click Convert to transaction — the offer becomes a deal in the Transaction Coordinator with the full inspection / appraisal / closing timeline auto-populated.",
    ],
  },
  {
    slug: "listings",
    title: "Add a listing and run it through to close",
    description:
      "Track active and pending listings — pricing, marketing plan, showings, offers received, and time-to-close in one record.",
    readTime: "4 min",
    category: "deals",
    body: [
      "The Listings page is your seller-side dashboard. Each listing is one record covering pricing, days on market, scheduled showings, feedback rolled up from buyer tours, offers received, and the marketing plan progress.",
    ],
    steps: [
      "Open Sellers → Listings → New listing. Pull from MLS or enter manually.",
      "Set the listing price. The page surfaces the latest CMA snapshot and pricing-relative-to-market color (under / at / over).",
      "Click Attach marketing plan to auto-schedule the 30-day rollout (see the Marketing Plans guide).",
      "As buyer-side agents schedule showings on the property, the showings appear on the listing record with their feedback once submitted.",
      "Offers received roll into the listing card with side-by-side comparison: price, financing, contingencies, close date. Approve or counter from this view.",
      "On accepted offer, convert the listing to a Pending deal in the Transaction Coordinator.",
    ],
    related: [
      { label: "Marketing plans", href: "/help/guides/marketing-plans" },
      { label: "Build a seller presentation", href: "/help/guides/seller-presentation" },
    ],
  },
  {
    slug: "seller-presentation",
    title: "Build a seller presentation in 10 minutes",
    description:
      "Pull comps, generate a CMA, build a branded pitch deck, and run the listing appointment from your phone or tablet.",
    readTime: "5 min",
    category: "marketing",
    body: [
      "The Seller Presentation builder assembles a full listing-pitch deck from CMA data and your branding in about 10 minutes. The deck covers market context, recommended pricing range, your marketing plan, and a custom net-sheet for the seller — all editable inline before you walk in.",
    ],
    steps: [
      "Open Sellers → Presentations → New presentation. Enter the seller's address; we pull MLS comps automatically.",
      "Review the auto-generated CMA — adjust comps, weighting, and price range. The deck rebuilds as you change values.",
      "Customize the marketing plan slide: which channels you'll use, frequency, sample social posts.",
      "Personalize the cover slide with the seller's name and your headshot/branding.",
      "Save and present from any device. The seller sees an interactive web version (or click Export to PDF for a leave-behind). On signature, the address auto-becomes a listing record.",
    ],
    related: [
      { label: "Smart CMA Builder", href: "/help/guides/smart-cma-builder" },
    ],
  },
  {
    slug: "transactions-coordinator",
    title: "Use the Transaction Coordinator kanban",
    description:
      "Track every pending deal across the inspection / appraisal / closing pipeline. Date-based reminders prevent dropped balls.",
    readTime: "4 min",
    category: "deals",
    body: [
      "Once an offer is accepted, the deal moves into the Transaction Coordinator — a kanban-style board organized by stage: Under contract → Inspection → Appraisal → Loan commitment → Clear-to-close → Closed. Each card has the dates that matter, the documents collected, and the next task with its responsible party.",
    ],
    steps: [
      "Open Transactions → Coordinator from the sidebar.",
      "Each card shows the property, parties, closing date, and a colored badge for the next critical milestone (with days remaining).",
      "Drag cards between columns as the deal moves through stages. Date-based reminders auto-fire at standard intervals (inspection scheduled 2 days before deadline, appraisal followup at day 5, etc.).",
      "Click any card for the full deal view: timeline, documents, communications, and the responsible party for each pending task.",
      "Add a transaction coordinator team member (if you have one) and reassign tasks via the per-task assignee dropdown — they get notified in their own inbox.",
    ],
  },

  /* ─────────── Insights & analysis ─────────── */
  {
    slug: "performance-dashboard",
    title: "Read your performance dashboard",
    description:
      "Track lead-to-close conversion, average response time, and revenue projections from one screen — updated nightly.",
    readTime: "3 min",
    category: "analysis",
    body: [
      "The Performance dashboard is your monthly business review on autopilot. It shows lead-to-close conversion by source, average first-response time, deals in flight, expected closed volume for the next 90 days, and revenue trends quarter-over-quarter.",
    ],
    steps: [
      "Open Insights → Performance from the sidebar.",
      "The top row shows the four core KPIs: new leads, response time, deals in flight, and 90-day GCI projection. Each has a sparkline showing 12-week trend.",
      "Below, the funnel breakdown shows where leads drop off — typically the biggest leak is between 'first response' and 'first showing booked.'",
      "Filter by lead source to see which channels are actually paying off (most agents discover one or two sources contribute most of the closed volume).",
      "Click Export report to send a PDF to your broker or financial advisor.",
    ],
    related: [
      { label: "Lead source ROI", href: "/help/guides/lead-source-roi" },
    ],
  },
  {
    slug: "lead-source-roi",
    title: "Calculate ROI per lead source",
    description:
      "See which lead sources are paying for themselves — and which are draining your ad budget without producing closings.",
    readTime: "3 min",
    category: "analysis",
    body: [
      "Lead Source ROI is the single most clarifying report in CloseBoss. It connects ad spend / referral cost / portal subscription cost to actual closed transactions, by source, over your chosen window.",
    ],
    steps: [
      "Open Insights → Lead Source ROI.",
      "Enter your monthly cost per source (Zillow Premier subscription, Facebook ad spend, Google ad spend, etc.). One-time costs get amortized over the period you set.",
      "The report shows leads in, conversion rate, average commission per close, total commission earned, and ROI ratio per source.",
      "Drill into any source to see the per-deal P&L — sometimes one lead pays for the entire year, but it's worth knowing whether you got lucky or have a real engine.",
      "Use the result to reallocate spend: most agents discover one source has 5x+ the ROI of the next-best and should be doubled down on.",
    ],
  },
  {
    slug: "sphere-monetization",
    title: "Find your highest-leverage past clients",
    description:
      "The Sphere Monetization score ranks past clients and sphere contacts by combined buyer + seller potential — so you know who to call this week.",
    readTime: "3 min",
    category: "analysis",
    body: [
      "Most repeat business comes from people you already know — but it's easy to lose track of who's life-stage-ready to buy or sell again. Sphere Monetization scores every past client and sphere contact on two axes: seller score (years owned, equity growth, life events) and buyer score (income, life stage, market signals).",
    ],
    steps: [
      "Open Insights → Sphere monetization from the sidebar.",
      "The default view is sorted by combined score (both_high). Top of the list is people likely to be both selling and buying — your highest leverage.",
      "Filter by score type: Seller leverage only (likely sellers), Buyer leverage only (likely buyers), or Both high.",
      "Click into any contact to see the signals behind the score — purchase year, estimated equity, market activity in their neighborhood, life events from social/public records.",
      "Use the recommended outreach cadence on each contact: usually a quarterly check-in for high-score sphere, monthly for both_high.",
    ],
  },
  {
    slug: "growth-opportunities",
    title: "Mine the Growth & Opportunities feed",
    description:
      "Daily AI-surfaced opportunities — expired listings to call, hot leads going stale, market signals in your farms.",
    readTime: "3 min",
    category: "analysis",
    body: [
      "Growth & Opportunities is a daily feed of AI-surfaced actions outside your active pipeline — expireds in your area to call, withdrawn listings ready to relist, hot leads going stale, market shifts in your geographic farms, and rate-environment changes affecting affordability for your buyer list.",
    ],
    steps: [
      "Open Insights → Growth & Opportunities.",
      "Each card is one opportunity with a Why now reasoning, a recommended next step, and a one-click action button.",
      "Filter by type: Listings (expireds, withdrawns, FSBOs), Sphere (stale touchpoints), Market (rate moves, inventory shifts), Buyer signals (life events in your buyer list).",
      "Click Do now to take the suggested action — usually a templated call script, a draft email, or a prefilled outreach.",
      "Snooze or dismiss items that aren't relevant. The feed personalizes over time.",
    ],
  },

  /* ─────────── Property tools & calculators ─────────── */
  {
    slug: "smart-cma-builder",
    title: "Build a Smart CMA in under 5 minutes",
    description:
      "Pull MLS comps, weight them automatically, and produce a branded CMA PDF — ready to email or present.",
    readTime: "4 min",
    category: "calculators",
    body: [
      "The Smart CMA Builder pulls active and sold comps from MLS for any address, applies a default weighting based on proximity / sale recency / size, and produces a branded PDF report.",
      "Most agents customize 2–3 comp weights and the final price range, then send the PDF straight to the seller — total time under 5 minutes per CMA.",
    ],
    steps: [
      "Open Property Tools → Smart CMA Builder.",
      "Enter the subject property address; MLS comps populate automatically.",
      "Review the auto-selected comps. Add/remove via the search panel, or adjust each comp's weight from 0–100%.",
      "Adjust the recommended price range using the slider — the report updates live.",
      "Customize the cover with your photo + branding (saved from Settings).",
      "Click Export PDF or Email to seller. Saved CMAs live under Property Tools → CMAs for reuse.",
    ],
    related: [
      { label: "Build a seller presentation", href: "/help/guides/seller-presentation" },
    ],
  },
  {
    slug: "property-investment-analyzer",
    title: "Analyze a rental with the Property Investment Analyzer",
    description:
      "Run cap rate, cash-on-cash, NOI, and 5-year IRR on any rental in under 3 minutes. Saved scenarios stay on the deal.",
    readTime: "3 min",
    category: "calculators",
    body: [
      "The Property Investment Analyzer is built for buyer-side agents working with investor clients. Enter the property details, financing assumptions, and operating costs, and the tool returns cap rate, cash-on-cash return, 5-year IRR, and a full income statement.",
    ],
    steps: [
      "Open Property Tools → Property Investment Analyzer.",
      "Enter the property address (we auto-pull rent estimates and tax data) or paste the price and rent manually.",
      "Set financing: down payment %, interest rate, loan term. We auto-fill the latest market rate from our rate feed.",
      "Set operating costs: insurance, HOA, property management %, vacancy %, maintenance reserve. The defaults reflect the local average for that ZIP.",
      "Review outputs: NOI, cap rate, cash-on-cash, year-1 cash flow, 5-year IRR, breakeven occupancy. Toggle Scenarios to compare best/base/worst cases.",
      "Click Save to deal — the analysis attaches to the contact's record for future reference.",
    ],
    related: [
      { label: "AI Real Estate Deal Analyzer", href: "/help/guides/ai-deal-analyzer" },
    ],
  },
  {
    slug: "ai-deal-analyzer",
    title: "Run the AI Real Estate Deal Analyzer",
    description:
      "Paste any property URL or address — get a one-page AI-written deal memo covering condition, risks, and target price.",
    readTime: "3 min",
    category: "calculators",
    body: [
      "The AI Deal Analyzer is a fast first-screen tool for investors and rehabbers. Paste the property URL (Zillow, Redfin, MLS) or an address; the AI returns a one-page memo: property snapshot, condition flags from listing photos, neighborhood risk signals, comp-based target price range, and a recommended go/no-go.",
    ],
    steps: [
      "Open Property Tools → AI Deal Analyzer.",
      "Paste the property URL or address.",
      "Pick your strategy: Buy-and-hold, Flip, BRRRR, or House hack. The analyzer tunes its memo to your strategy's KPIs.",
      "Wait ~30 seconds for the AI to pull comps + analyze photos + draft the memo.",
      "Review the memo. Click any section heading to dive deeper (e.g. comps table, condition flags from photos, rent estimate breakdown).",
      "Click Save to deal or Export PDF to share with a partner or lender.",
    ],
  },
  {
    slug: "ai-zillow-link-analyzer",
    title: "Use the Zillow / Redfin Link Analyzer",
    description:
      "Drop a Zillow or Redfin URL — get an AI-written summary of the listing's strengths, red flags, and price defensibility.",
    readTime: "2 min",
    category: "calculators",
    body: [
      "When a client texts you a Zillow link asking 'what do you think?' the Zillow / Redfin Link Analyzer turns a 20-minute mental review into a 30-second AI summary. Paste the link, and the AI pulls the listing details, photo signals, neighborhood data, and recent comps to flag what's noteworthy.",
    ],
    steps: [
      "Open Property Tools → Zillow / Redfin Link Analyzer (also accessible from any contact via Quick actions).",
      "Paste the Zillow or Redfin URL.",
      "The AI returns a summary covering: list price vs. comps, condition signals from photos, neighborhood walkability/schools, price-per-square-foot context, and any red flags (HOA issues, sloped lot, dated systems).",
      "Click Send to client to text or email the summary directly to the contact, branded with your name.",
    ],
  },
  {
    slug: "mortgage-calculator-share",
    title: "Send a buyer a custom mortgage calculator",
    description:
      "Pre-fill the Mortgage Calculator for a specific property and send the buyer a branded link they can play with.",
    readTime: "2 min",
    category: "calculators",
    body: [
      "Buyers obsess over monthly payment math. Instead of doing the math in a text thread, send them a pre-filled, branded mortgage calculator they can adjust themselves — down payment, rate, term, taxes — and see exactly what their monthly payment would be.",
    ],
    steps: [
      "Open Property Tools → Mortgage Calculator.",
      "Enter the home price (or pre-fill from the buyer's saved deal record).",
      "Set the default down payment and rate. The buyer can change anything from their end.",
      "Click Generate share link. The URL opens a branded calculator with your photo, name, and contact button.",
      "Send via SMS or email from inside CloseBoss. Every interaction (open, change, contact click) shows up on the contact timeline.",
    ],
  },
  {
    slug: "cap-rate-calculator-howto",
    title: "Use the Cap Rate & ROI Calculator",
    description:
      "Calculate cap rate, NOI, and ROI on any rental in under a minute. Pair with the Investment Analyzer for the full picture.",
    readTime: "2 min",
    category: "calculators",
    body: [
      "The Cap Rate & ROI Calculator is the fastest way to screen an investment property. Enter purchase price, rent, vacancy, and operating expenses, and get cap rate, NOI, and a high-level ROI number in seconds.",
    ],
    steps: [
      "Open Property Tools → Cap Rate Calculator.",
      "Enter purchase price and expected gross rent.",
      "Set vacancy & credit loss (default 5%) and total operating expenses (taxes, insurance, maintenance, HOA, management).",
      "The calculator returns NOI, cap rate, and ROI estimates.",
      "Click Open in Investment Analyzer if you want the full DCF model with financing, IRR, and multi-year cash flow.",
    ],
    related: [
      { label: "What is cap rate?", href: "/blog/what-is-cap-rate" },
      { label: "Property Investment Analyzer", href: "/help/guides/property-investment-analyzer" },
    ],
  },
  {
    slug: "property-report",
    title: "Generate a branded property report PDF",
    description:
      "Drop an address — get a 6-page branded PDF covering market context, comps, valuation, and neighborhood data.",
    readTime: "3 min",
    category: "calculators",
    body: [
      "The Property Report Generator produces a 6-page branded PDF for any address — market context, recent sales, valuation range, neighborhood demographics, school data, and a section to position yourself. Use it as a leave-behind at open houses, a follow-up to a Zillow link request, or a seller-prospecting touch.",
    ],
    steps: [
      "Open Property Tools → Property Report.",
      "Enter the address. The report auto-builds with the latest comp data and market context.",
      "Customize the cover slide and the agent bio page (saved from Settings).",
      "Preview the full PDF; edit any text inline.",
      "Export or Email — sending from CloseBoss logs the touchpoint on the contact's timeline.",
    ],
  },

  /* ─────────── Sales model & playbooks ─────────── */
  {
    slug: "sales-model",
    title: "Configure your sales model",
    description:
      "Tell CloseBoss how you run your business — lifecycle stages, target conversion rates, average commission — so it can coach you in your context.",
    readTime: "3 min",
    category: "workflows",
    body: [
      "The Sales Model panel is where you define how your business actually works: lifecycle stages from new lead to closed, target conversion rates between stages, your average commission per close, and your annual GCI target. This data feeds every projection, coaching nudge, and growth recommendation across CloseBoss.",
    ],
    steps: [
      "Open Workflow → Sales Model from the sidebar.",
      "Review the default lifecycle: New lead → Contacted → Appointment set → Shown → Offer made → Under contract → Closed. Rename or add stages to match how you actually work.",
      "Set target conversion rates per stage. If you don't know yours, use the suggested defaults — the system will recalibrate from your real data after 90 days.",
      "Enter average commission per close and your annual GCI target.",
      "Save. The Performance dashboard and Deal Coach now project against these numbers.",
    ],
  },
  {
    slug: "playbooks",
    title: "Use playbooks for repeatable workflows",
    description:
      "Save your best sequences — buyer onboarding, FSBO outreach, expired follow-up — as repeatable playbooks anyone on the team can run.",
    readTime: "3 min",
    category: "workflows",
    body: [
      "Playbooks are saved multi-step workflows: a checklist of tasks + templated messages + automated triggers that you (or any team member) can apply to any contact or deal in one click. The default library covers buyer onboarding, FSBO outreach, expired listing follow-up, and post-closing nurture.",
    ],
    steps: [
      "Open Workflow → Playbooks from the sidebar.",
      "Pick a starter playbook or click New playbook.",
      "Define the steps: each is either a task (assigned to you or someone else, with a due date offset), a templated message (SMS, email, or video), or an automated check (e.g. 'pause until BBA signed').",
      "Optional: set triggers — auto-apply this playbook when a contact lifecycle moves to New lead, or when a deal hits Under contract.",
      "Save. Apply to any contact/deal from the contact page → Apply playbook.",
    ],
  },

  /* ─────────── Account & settings ─────────── */
  {
    slug: "billing",
    title: "Manage billing and change plans",
    description:
      "Upgrade, downgrade, change payment method, and download invoices for accounting from one screen.",
    readTime: "2 min",
    category: "account",
    body: [
      "Billing is self-serve. You can change plans, swap payment methods, and download any past invoice without contacting support. Plan changes prorate immediately — downgrades take effect at the next billing cycle so you don't lose mid-cycle features.",
    ],
    steps: [
      "Open Account → Billing from the sidebar (or the avatar menu).",
      "Current plan + next-bill date show at the top. Click Change plan to upgrade/downgrade.",
      "Click Update payment method to swap cards or switch to ACH.",
      "Scroll to Invoices to download any past invoice as a PDF — useful for accounting.",
      "Cancellation is a one-click action under Subscription → Cancel. You keep access through the end of the paid period.",
    ],
  },
  {
    slug: "profile",
    title: "Update your profile and branding",
    description:
      "Update your photo, headshot, contact info, signature, brokerage logo, and the default branding applied to every outbound message.",
    readTime: "2 min",
    category: "account",
    body: [
      "Your profile is the single source of truth for branding across CloseBoss — emails, video email cover frame, postcards, CMAs, property reports, marketing posts. Update it once and every outbound surface reflects the change.",
    ],
    steps: [
      "Open Account → Profile.",
      "Upload your headshot (square, 400×400 min) and brokerage logo (transparent PNG preferred).",
      "Set your email signature, license number, brokerage name, and direct phone.",
      "Pick your brand color — used across CMAs, property reports, and the home-value widget.",
      "Save. Outbound materials regenerate the next time they render.",
    ],
  },
  {
    slug: "integrations",
    title: "Connect your email, calendar, and lead sources",
    description:
      "Connect Google/Microsoft for email + calendar sync, plus lead-source integrations for Zillow, Facebook, and your IDX site.",
    readTime: "3 min",
    category: "account",
    body: [
      "Integrations are the wiring that lets CloseBoss sit inside your existing workflow. Email + calendar sync means every conversation and appointment lands on the contact timeline automatically; lead-source connectors mean new leads flow through AI follow-up without you forwarding anything.",
    ],
    steps: [
      "Open Settings → Channels & Compliance → Integrations.",
      "Connect Google or Microsoft 365 — this enables email sync (Gmail/Outlook threads attach to contacts), calendar sync (your bookings show on the CloseBoss calendar), and OAuth-based sending.",
      "Connect lead sources: Zillow Premier Agent, Facebook Lead Ads, Realtor.com, plus your IDX site forms via the embeddable webhook.",
      "For each source, test it: trigger a sample submission. The lead should land in your Lead Queue within 30 seconds.",
      "Optional: connect Dotloop or DocuSign for e-signature, and Zapier / Make for any custom workflow.",
    ],
  },
  {
    slug: "data-export",
    title: "Export your data",
    description:
      "Download a full CSV of contacts, deals, and conversation history at any time. No lock-in, no support ticket required.",
    readTime: "2 min",
    category: "account",
    body: [
      "You can export everything in CloseBoss at any time. Contacts, deals, and conversation history come as CSVs; documents (offers, BBAs, CMAs) come as a ZIP of PDFs. Use this to back up your data, to bring it to an accountant, or to leave for another platform.",
    ],
    steps: [
      "Open Settings → Data & Tools → Export.",
      "Pick what to export: Contacts, Deals, Conversations, Documents, or Everything.",
      "For large workspaces (5,000+ contacts), the export runs as a background job and you'll get a download link by email within ~10 minutes.",
      "Files are auto-encrypted with a temporary download link valid for 24 hours.",
      "Re-export anytime — no quota, no fees.",
    ],
  },
  {
    slug: "ai-outbound-sphere-calls",
    title: "Have your AI call your sphere to follow up",
    description:
      "Set your AI to place real outbound voice calls — not just texts — to nurture your sphere and leads. Choose who, when, and what it says.",
    readTime: "4 min",
    category: "ai-and-voice",
    body: [
      "Unlike SMS-only CRMs, CloseBoss can pick up the phone and call your sphere for you — check-ins, just-listed/just-sold updates, price-drop alerts, and lead follow-up — in a natural AI voice from your number.",
      "You stay in control: pick the contacts, the intent, and whether calls go out automatically or wait for your approval.",
    ],
    steps: [
      "Open the Sales Assistant → Outreach and choose the Call channel (alongside SMS and Email).",
      "Pick the audience — a smart list, a sphere segment, or a single contact.",
      "Set the intent (check-in, market update, follow-up) and review the AI talking points; tune the tone in Settings → Voice & Style.",
      "Choose send-now or schedule for later, and whether to auto-place or require your approval.",
      "After each call the transcript and outcome are logged to the contact and your pipeline automatically.",
    ],
    related: [
      { label: "Does CloseBoss make phone calls? (FAQ)", href: "/help/faq#ai_followup" },
      { label: "Configure voice AI for inbound calls", href: "/help/guides/voice-ai-inbound" },
      { label: "Set up missed-call text-back", href: "/help/guides/missed-call-text-back" },
    ],
  },
  {
    slug: "property-deep-report",
    title: "Generate a Property Deep Report for a buyer",
    description:
      "Produce a full buyer-decision report — value, loan affordability, deal rating, investment ROI, schools, neighborhood, and a location map — from one address.",
    readTime: "3 min",
    category: "analysis",
    body: [
      "The Property Deep Report is everything a buyer needs to decide, built from an address and how they'll use the home. It reuses your CMA data and adds loan affordability, an AI deal rating, and investment returns for rentals.",
      "Each report is shareable by link and exportable to PDF, branded with your profile.",
    ],
    steps: [
      "Open Sales Assistant → Deep Report.",
      "Enter the property address and pick the intended use: primary residence, second home, or investment.",
      "Optionally adjust the loan assumptions (down payment, rate, term) — sensible defaults are prefilled.",
      "Click Generate. The team pulls comps, computes affordability + ROI, rates the deal, and looks up schools and the neighborhood.",
      "Copy the share link or download the PDF to send to your buyer.",
    ],
    related: [
      { label: "What reports can the AI generate? (FAQ)", href: "/help/faq#ai_followup" },
      { label: "Run an AI House Search", href: "/help/guides/ai-house-search" },
      { label: "Smart CMA Builder", href: "/help/guides/smart-cma-builder" },
    ],
  },
  {
    slug: "ai-house-search",
    title: "Run an AI House Search and email a buyer",
    description:
      "Describe what a buyer wants in plain English, get matched real listings, refine, and email the best ones to the buyer in a click.",
    readTime: "3 min",
    category: "deals",
    body: [
      "AI House Search finds real, current listings from a natural-language brief, grounded in live web data. Add refinements as checkboxes to narrow the results, then send the best matches to your buyer.",
      "It's the fast way to put a curated lineup in front of a buyer without manually hunting the portals.",
    ],
    steps: [
      "Open Sales Assistant → House Search.",
      "Describe the buyer's criteria in plain English (location, price, beds/baths, must-haves).",
      "Review the matches; check any suggested refinements and re-run to narrow the list.",
      "Select the listings to send and click Email to buyer — pick a contact or type an address.",
      "The buyer receives a branded email with the lineup and your signature.",
    ],
    related: [
      { label: "Generate a Property Deep Report", href: "/help/guides/property-deep-report" },
      { label: "What reports can the AI generate? (FAQ)", href: "/help/faq#ai_followup" },
    ],
  },
  {
    slug: "ai-cold-call-qualify",
    title: "Have the AI cold-call and qualify a lead list",
    description:
      "Point the Sales Assistant at a lead list and it places outbound calls, qualifies buyers and sellers on budget, timeline, and motivation, and scores who's ready.",
    readTime: "4 min",
    category: "ai-and-voice",
    body: [
      "Cold outreach is the work agents most want off their plate. The Sales Assistant places real outbound voice calls to a list of new or aged leads, runs a natural qualifying conversation, and routes the hot ones to you — so you stop dialing and start closing.",
      "It qualifies for both sides of the deal: buyers (budget, area, timeline, financing) and sellers (motivation, timeline, price expectations).",
    ],
    steps: [
      "Open Sales Assistant → Outreach and choose the Call channel.",
      "Select the lead list or smart segment to call (new leads, aged leads, a portal import).",
      "Pick the goal — qualify buyer, qualify seller, or reactivate — and review the qualifying questions and tone.",
      "Choose send-now or schedule, and whether calls auto-place or wait for your approval.",
      "As calls complete, each lead is scored on intent and the qualified ones are booked; transcripts and notes log to the contact automatically.",
    ],
    related: [
      { label: "Can the AI cold-call and qualify leads? (FAQ)", href: "/help/faq#ai_followup" },
      { label: "Have your AI call your sphere", href: "/help/guides/ai-outbound-sphere-calls" },
      { label: "Configure voice AI for inbound calls", href: "/help/guides/voice-ai-inbound" },
    ],
  },
  ...SETTINGS_GUIDES,
];

/** Lookup helper for the dynamic [slug] page. */
export function getGuide(slug: string): HelpGuide | null {
  return HELP_GUIDES.find((g) => g.slug === slug) ?? null;
}

/** Convenience: group guides by category in the order declared below. */
export function groupedGuides(): Array<{
  category: HelpCategory;
  label: string;
  description: string;
  guides: HelpGuide[];
}> {
  const order: Array<{ id: HelpCategory; label: string; description: string }> = [
    {
      id: "setup",
      label: "Getting started",
      description: "Set up CloseBoss in your first week — pick a follow-up policy, import data, configure phone numbers.",
    },
    {
      id: "lead-capture",
      label: "Lead capture & generation",
      description: "Pull new leads into the CRM — IDX site forms, open houses, lead queue triage, AI-generated content.",
    },
    {
      id: "communication",
      label: "Conversations & messaging",
      description: "Run inbox, drafts, templates, missed-call recovery, and video email day-to-day.",
    },
    {
      id: "ai-and-voice",
      label: "AI & voice features",
      description: "AI follow-up, voice AI for inbound calls, deal coach suggestions, and the AI drafting style controls.",
    },
    {
      id: "deals",
      label: "Deal workflows",
      description: "Buyer offers, seller listings, the transaction coordinator, and the Buyer Broker Agreement (BBA) workflow.",
    },
    {
      id: "marketing",
      label: "Marketing & content",
      description: "Marketing plans, seller presentations, postcards, and the AI Comparison Report.",
    },
    {
      id: "analysis",
      label: "Insights & analysis",
      description: "Performance dashboards, sphere monetization, lead-source ROI, and growth opportunities.",
    },
    {
      id: "calculators",
      label: "Property tools & calculators",
      description: "CMA builder, investment analyzers, mortgage / cap-rate / cash-flow calculators, and the report generator.",
    },
    {
      id: "workflows",
      label: "Sales model & playbooks",
      description: "Configure your sales model, build playbooks, and connect tasks to lifecycle stages.",
    },
    {
      id: "coaching",
      label: "Coaching",
      description: "Enroll in Producer / Top Producer Track, opt out, and read the weekly playbooks.",
    },
    {
      id: "account",
      label: "Account & settings",
      description: "Profile, billing, integrations, team seats, compliance settings, and data exports.",
    },
  ];
  return order
    .map((c) => ({
      category: c.id,
      label: c.label,
      description: c.description,
      guides: HELP_GUIDES.filter((g) => g.category === c.id),
    }))
    .filter((g) => g.guides.length > 0);
}
