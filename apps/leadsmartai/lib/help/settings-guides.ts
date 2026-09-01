import type { HelpGuide } from "./guides";

/**
 * Settings reference guides — one per panel on /dashboard/settings.
 *
 * Every switch an agent can flip now has a written explanation of what it
 * does and what happens if they get it wrong. Before this file, twelve
 * panels had no coverage anywhere in the help center: timing, compliance,
 * briefings, IDX routing, sphere drip, commission defaults, deal
 * notifications, social autopilot, the weekly schedule, assistant voice and
 * app language.
 *
 * The steps below mirror the panel copy in
 * packages/i18n/locales/en/dashboard.json. If a panel's fields change, the
 * matching guide here has to change with it — these are instructions people
 * follow literally, so a stale step is worse than no step.
 *
 * Kept in its own module rather than appended to guides.ts, which is already
 * long enough that finding a single guide in it is a chore.
 */
export const SETTINGS_GUIDES: ReadonlyArray<HelpGuide> = [
  {
    slug: "review-policy",
    title: "Review Policy: decide what sends without you",
    description:
      "The single most consequential setting in Messages — autosend, review every message, or pick per category.",
    readTime: "3 min",
    category: "communication",
    body: [
      "Review Policy decides one thing: when a trigger fires, does the message go out, or does it wait for you? It applies to every template on every channel, so it is worth getting right before anything else.",
      "There is no wrong answer, only a trade. Review is slower but nothing goes out in your name unread. Autosend is faster and is the whole point of automated follow-up — a lead answered in 60 seconds converts better than one answered in an hour.",
    ],
    steps: [
      "Open Settings → Messages. Review Policy is the first card.",
      "Review each one — every triggered message becomes a draft in your approval queue and nothing sends silently. This is the right choice for your first weeks, or coming back after a break.",
      "Autosend everything — messages go out the moment triggers fire, and you see them in the history log. Choose this once you trust how the templates read in your voice.",
      "Let me pick per category — different rules for different kinds of message. Review sphere outreach, autosend tour confirmations.",
      "Read the “What this means right now” line before you save. It spells out, in plain words, what your current choice does.",
      "Save. Note that for your first 30 days everything stays in review regardless of what you pick here — see the compliance guide.",
    ],
    related: [
      { label: "Approve or edit AI drafts before they send", href: "/help/guides/drafts" },
      { label: "The compliance rules you cannot turn off", href: "/help/guides/compliance-guardrails" },
      { label: "Set quiet hours and daily message limits", href: "/help/guides/message-timing" },
    ],
  },
  {
    slug: "home-value-smart-link",
    title: "Share your Home Value Smart Link",
    description:
      "The link you hand homeowners: they type an address, get an estimate, and become a lead attributed to you.",
    readTime: "2 min",
    category: "lead-capture",
    body: [
      "This is a seller-lead magnet. A homeowner opens the link, types nothing but an address, and gets an estimated value straight away. To see the full report they leave an email — and that is the trade.",
      "It is not a passive calculator. A submitted address creates a contact and a lead in your CRM, emails you, and starts a follow-up sequence.",
    ],
    steps: [
      "Open Settings → Data & Tools and find Home Value Smart Link.",
      "The box shows your full link, including the agentId that attributes the lead to you. Click it to select it, or use Copy link.",
      "Use Share to hand it straight to someone, or paste it anywhere homeowners already are: a “What's my home worth?” button on your site, your Instagram bio, a QR code on a mailer or open-house sign.",
      "Keep the whole URL. The agentId on the end is what makes the lead yours — share the bare page and the lead lands unattributed.",
      "When someone submits, you get an email, a contact and lead appear in your CRM, and an email sequence starts automatically. Nothing else to set up.",
    ],
    related: [
      { label: "Capture home-value leads from your IDX site", href: "/help/guides/home-value-leads" },
      { label: "Work the Lead Queue", href: "/help/guides/lead-queue-triage" },
    ],
  },
  {
    slug: "sending-identity",
    title: "The number and address your contacts see",
    description:
      "What the Channels card tells you about your sending phone number and email — and why you cannot edit it yourself.",
    readTime: "2 min",
    category: "account",
    body: [
      "Everything CloseBoss sends goes out from one number and one address. This card shows you which, and whether each is verified.",
      "It is deliberately read-only. A verified sender is what keeps your texts out of carrier spam filters and your email out of junk folders, so changing one is a support request rather than a text field.",
    ],
    steps: [
      "Open Settings → Channels & Compliance. Channels is the first card.",
      "Check the SMS side: the number your contacts see, its verification state, and its 10DLC registration state. 10DLC is the carrier registration that makes business texting deliverable in the US.",
      "Note the opt-out keywords listed there — they are handled for you, in English and Chinese, and cannot be turned off.",
      "Check the email side: your sending address and whether it is verified, plus DKIM, SPF and DMARC — the three DNS records that tell inbox providers your mail is really yours.",
      "To change a verified number or address, contact support. There is no self-serve edit, by design.",
    ],
    related: [
      { label: "Provision a CloseBoss phone number", href: "/help/guides/phone-number-setup" },
      { label: "The compliance rules you cannot turn off", href: "/help/guides/compliance-guardrails" },
    ],
  },
  {
    slug: "connect-social-accounts",
    title: "Connect your social accounts",
    description:
      "Where to link Facebook, Instagram, LinkedIn and Threads — the step everything else on the Channels tab depends on.",
    readTime: "2 min",
    category: "marketing",
    body: [
      "Auto-posting and the weekly schedule can only publish where you are connected. If nothing is linked, both will look configured and quietly post nowhere.",
      "Connections live on one page. This card is the pointer to it.",
    ],
    steps: [
      "Open Settings → Channels & Compliance and find Connected social accounts.",
      "Click Manage connected accounts.",
      "Connect each network you want to publish to. Instagram publishing needs a business Instagram account linked to your Facebook Page — a personal account cannot be posted to by any tool.",
      "Come back and set up Social auto-posting or the Weekly post schedule. Both will now have somewhere to publish.",
      "If a post never appears, check here first — a disconnected or expired account is the usual cause.",
    ],
    related: [
      { label: "Let AI run my social media", href: "/help/guides/social-autopilot" },
      { label: "Schedule a specific week of social posts", href: "/help/guides/weekly-social-schedule" },
    ],
  },
  {
    slug: "settings-tour",
    title: "The Settings tour: what lives on each tab",
    description:
      "A map of all four Settings tabs — Voice & Style, Messages, Data & Tools, Channels & Compliance — and which guide covers each panel.",
    readTime: "4 min",
    category: "setup",
    body: [
      "Settings is four tabs, and most agents only ever open the first one. This is the map: what each tab controls, and where to read more.",
      "Nothing here is dangerous to look at. The only settings that change what your contacts receive are Review Policy, Timing, and the Channels tab — everything else affects you, not them.",
    ],
    steps: [
      "Voice & Style — how CloseBoss sounds. App language, AI writing personality and style notes, the phone assistant's voice, your AI Receptionist, and missed-call text-back.",
      "Messages — what CloseBoss sends, and when. Review Policy (review each one, autosend everything, or pick per category), your templates, Timing & Frequency, and the sphere drip cadence.",
      "Data & Tools — the Home Value Smart Link you share with homeowners, and CSV/MLS contact import.",
      "Channels & Compliance — the plumbing: your sending number and email address (read-only — contact support to change a verified sender), connected social accounts, auto-posting and the weekly schedule, IDX lead routing, deal notifications, commission defaults, and the compliance guardrails.",
      "Each panel saves on its own. There is no global Save button, and no setting silently changes another.",
    ],
    related: [
      { label: "Settings, card by card (with screenshots)", href: "/help/settings" },
      { label: "Review Policy: decide what sends without you", href: "/help/guides/review-policy" },
      { label: "Set quiet hours and daily message limits", href: "/help/guides/message-timing" },
      { label: "The compliance rules you cannot turn off", href: "/help/guides/compliance-guardrails" },
    ],
  },
  {
    slug: "message-timing",
    title: "Set quiet hours and daily message limits",
    description:
      "Stop the AI texting at 11pm. Set quiet hours, a per-contact daily cap, and the pause that stops the AI talking over you after someone replies.",
    readTime: "3 min",
    category: "communication",
    body: [
      "Timing rules apply to every outbound SMS and email the AI sends, across every template and sequence. They override template-level settings, and where two rules disagree the most restrictive one wins.",
      "These are the settings that keep automated follow-up from reading as spam. Getting them wrong is the fastest way to earn a STOP.",
    ],
    steps: [
      "Open Settings → Messages and find Timing & Frequency.",
      "Set Quiet hours begin and Quiet hours end. No outbound SMS or email goes out between those times; queued messages resume at the end time.",
      "Turn on Use the contact's local timezone if you work referrals or out-of-state buyers. Your 9pm cutoff becomes their 9pm cutoff rather than yours.",
      "Leave No outbound messages Sunday before noon switched on unless you have a specific reason not to — Sunday-morning texting reliably annoys people.",
      "Set Max messages per contact per day. It counts SMS and email combined, and it is a hard cap that no template can override.",
      "Set Pause triggers for (days) after a contact replies. This stops automated sequences from talking over you once a real conversation has started.",
      "Optional: turn on Pause all outbound during Chinese New Year if you serve Chinese-speaking clients. It is detected from each contact's language preference and resumes the Monday after the five-day window.",
    ],
    related: [
      { label: "Approve or edit AI drafts before they send", href: "/help/guides/drafts" },
      { label: "The compliance rules you cannot turn off", href: "/help/guides/compliance-guardrails" },
    ],
  },
  {
    slug: "compliance-guardrails",
    title: "The compliance rules you cannot turn off",
    description:
      "STOP handling, first-SMS opt-out language, the agent-of-record check, California AVM disclosure, and the 30-day draft-only window on new accounts.",
    readTime: "4 min",
    category: "account",
    body: [
      "Some behavior is enforced for you and cannot be switched off. Real-estate messaging carries more legal exposure than most software accounts for, so these run whether you configure anything or not.",
      "Read this once. It explains several things that otherwise look like bugs — most commonly, why your first 30 days force every message into review, and why some equity messages refuse to send.",
      "These guardrails implement our compliance requirements but are not legal advice. If you message at scale or work across multiple states, have your own counsel review the behavior before relying on it.",
    ],
    steps: [
      "STOP / HELP handling is bilingual and permanent. STOP, UNSUBSCRIBE, CANCEL, QUIT and END — plus the Chinese equivalents — suppress all future messages to that contact forever. HELP returns your contact information.",
      "Your first SMS to any new contact automatically appends “Reply STOP to opt out”, in Chinese if that is the contact's language preference. It is suppressed on later messages in the same thread, so you are not repeating it.",
      "Equity and home-value templates run an agent-of-record check: they only send if you represented that contact on that specific property. This is what prevents steering and dual-agency complaints, and it is why one of these sometimes refuses to send.",
      "If your registered state is California, AB 2863 disclosure language auto-appends to AVM email variants. The SMS variants are suppressed in regulated states, because the disclosure does not fit in 160 characters.",
      "For your first 30 days, every template defaults to Review mode no matter what your Review Policy says. Auto-send becomes available on day 31.",
      "Imported past clients require explicit anniversary opt-in, per contact. The flag defaults to off, and no anniversary message fires without it.",
      "You can read the current list any time at Settings → Channels & Compliance → Compliance.",
    ],
    related: [
      { label: "Set quiet hours and daily message limits", href: "/help/guides/message-timing" },
      { label: "Import contacts from another CRM", href: "/help/guides/lead-import" },
    ],
  },
  {
    slug: "daily-briefings",
    title: "Get a morning briefing and evening summary",
    description:
      "Schedule the morning plan and evening recap that appear on your dashboard and in the mobile app — and set the timezone they fire in.",
    readTime: "2 min",
    category: "workflows",
    body: [
      "The morning briefing is a start-of-day plan: hot leads and follow-ups. The evening summary is the recap — what you missed, and a preview of tomorrow. Both appear on your dashboard and in the mobile app.",
      "The timezone here is your whole account's — briefings, office hours, and every appointment your AI Receptionist books all run on it. There is only one, so setting it once is enough.",
    ],
    steps: [
      "Open Ask Max and click Briefing schedule, under the opening briefing.",
      "Set a Morning briefing time, or leave it blank to turn the morning plan off.",
      "Set an Evening summary time, or leave it blank to skip the recap.",
      "Choose your Timezone from the list. If your zone is not listed, pick “Other timezone…” and enter an IANA name such as Europe/Berlin.",
      "Click Save schedule. Briefings fire at the times above, in the zone you chose.",
    ],
    // Carried on the guide itself rather than through the Settings card map:
    // this panel is no longer a Settings card, but the panel is unchanged and
    // a picture of it still helps.
    images: [
      {
        src: "/help/settings/daily-briefings.png",
        alt: "The briefing schedule: morning time, evening time and timezone",
        caption: "Ask Max → Briefing schedule",
      },
    ],
    related: [
      { label: "Read your performance dashboard", href: "/help/guides/performance-dashboard" },
      { label: "Mine the Growth & Opportunities feed", href: "/help/guides/growth-opportunities" },
    ],
  },
  {
    slug: "idx-lead-routing",
    title: "Join the IDX lead-routing pool and claim your ZIPs",
    description:
      "Opt into round-robin assignment for inbound IDX leads, and declare the ZIP codes you actually serve.",
    readTime: "2 min",
    category: "lead-capture",
    body: [
      "Inbound IDX leads are handed out in rotation among the agents who opted in. If you are not in the pool, you do not get them.",
      "The picker uses least-recently-assigned ordering, so whoever has waited longest is next. It is not weighted by production.",
    ],
    steps: [
      "Open Settings → Channels & Compliance and find IDX lead routing.",
      "Turn on Include me in the round-robin pool.",
      "In ZIP coverage, enter the 5-digit ZIPs you serve, separated by commas or spaces (for example: 78701, 78702, 78703). Leads in those ZIPs come to you first.",
      "Leave ZIP coverage blank to stay eligible for leads from any area. ZIPs nobody covers fall through to the whole pool.",
      "Click Save settings, then check the list reads back the way you expect — junk values are dropped automatically.",
    ],
    related: [
      { label: "Work the Lead Queue", href: "/help/guides/lead-queue-triage" },
      { label: "Capture home-value leads from your IDX site", href: "/help/guides/home-value-leads" },
    ],
  },
  {
    slug: "sphere-drip-settings",
    title: "Turn on the sphere drip cadence",
    description:
      "Auto-enroll your best past clients into a six-touch, ~30-day nurture cadence that runs in the background and honors your review policy.",
    readTime: "2 min",
    category: "communication",
    body: [
      "Sphere drip auto-enrolls your high-leverage past clients and sphere contacts — the “both-high” cohort — into a six-touch nurture cadence spread over roughly 30 days, mixing SMS and email.",
      "A daily job enrolls eligible contacts and an hourly job advances the cadence. Every message it produces honors your Review Policy and your DNC flags — turning this on does not start auto-sending.",
    ],
    steps: [
      "Open Settings → Messages and find Sphere drip cadence.",
      "Turn on Enable sphere drip for my account.",
      "Use Notes to record why you set it the way you did — it is a free-text reminder for yourself, e.g. “paused for vacation, resume Aug 15”.",
      "Save. Once saved, your explicit choice is locked in, and later pilot-allowlist changes will not override it.",
      "Check your Review Policy before you walk away. If it is set to auto-send, drip messages go out without you seeing them first.",
    ],
    related: [
      { label: "Find your highest-leverage past clients", href: "/help/guides/sphere-monetization" },
      { label: "Approve or edit AI drafts before they send", href: "/help/guides/drafts" },
    ],
  },
  {
    slug: "commission-defaults",
    title: "Set your default commission splits",
    description:
      "Buyer-side, listing-side, brokerage split and referral fee — applied to new deals and to your revenue analytics.",
    readTime: "2 min",
    category: "deals",
    body: [
      "These values pre-fill every new transaction and drive the revenue numbers on your performance dashboard. They are defaults, not rules.",
      "Editing them never retro-changes a closed deal. Re-running the math on an existing transaction uses the values already stored on that deal.",
    ],
    steps: [
      "Open Settings → Channels & Compliance and find Commission defaults.",
      "Set your Buyer-side commission and Listing-side commission. Both are typically 2.5–3.0%; the buyer side is negotiated as an offer of cooperation.",
      "Set Brokerage split (your share) — the portion you keep. 70 means a 70/30 split in your favor; use 100 if you are solo on your own license.",
      "Set a Default referral fee if you owe a fixed referrer. Note that it comes off the TOP, before your brokerage split is applied — leave it at 0 if you do not owe one.",
      "Save. Any individual deal can still override all four, for referral deals, bonus splits or flat-fee arrangements.",
    ],
    related: [
      { label: "Read your performance dashboard", href: "/help/guides/performance-dashboard" },
      { label: "Use the Transaction Coordinator kanban", href: "/help/guides/transactions-coordinator" },
    ],
  },
  {
    slug: "deal-notifications",
    title: "Choose which deal alerts you get",
    description:
      "The daily task digest, the weekly growth digest, and the wire-fraud SMS you should leave switched on.",
    readTime: "2 min",
    category: "deals",
    body: [
      "Three separate notifications, each independently switchable. One of them is a fraud control rather than a convenience.",
    ],
    steps: [
      "Open Settings → Channels & Compliance and find Transaction Coordinator notifications.",
      "Set Digest frequency for the daily task digest: Daily, Weekly (Monday), or Off. It emails your overdue tasks plus anything due in the next 72 hours, at around 8am Pacific.",
      "Leave the Wire-fraud SMS alert on. It texts you 24–48 hours before closing if the wire-verification task is still incomplete. Turning it off is strongly discouraged.",
      "Optional: turn on the Weekly growth digest for a Monday email with your top three AI-generated growth opportunities. It only sends when you have two or more, so quiet weeks stay quiet.",
    ],
    related: [
      { label: "Use the Transaction Coordinator kanban", href: "/help/guides/transactions-coordinator" },
      { label: "Mine the Growth & Opportunities feed", href: "/help/guides/growth-opportunities" },
    ],
  },
  {
    slug: "social-autopilot",
    title: "Let AI run your social media",
    description:
      "Hand posting frequency, channels, topics and timing to the AI — or set them yourself and keep approval rights.",
    readTime: "3 min",
    category: "marketing",
    body: [
      "Autopilot decides how often to post, which connected accounts to use, which topics to cover and what time to publish, then re-plans every week.",
      "Your approval setting applies either way. Autopilot controls what gets drafted and scheduled, not whether it publishes without you.",
    ],
    steps: [
      "Connect your accounts first, at Settings → Channels & Compliance. Autopilot can only post where you are connected.",
      "Find Social auto-posting on the same tab.",
      "Turn on Let AI run my social media to hand over frequency, channels, topics and timing. Leave it off to set them yourself.",
      "If you are setting it yourself: choose Where to post, What to post about, Posts per week, Max per day, Days to post and Time of day. There is also a switch to include one market-news post each week.",
      "Set Who approves posts. “I approve every post” writes and schedules the week but publishes nothing until you say so. “Boss Assistant approves” fact-checks each post against what your business actually does, schedules what it can verify, and holds the rest with a reason. “Full autopilot” is the only option where something reaches your feed that nobody has read.",
      "Note that this governs social posts only. Live calls and text replies cannot wait for approval, so they are controlled by each assistant's own settings.",
      "Save. With AI automation on, the settings below it are chosen for you each week and shown read-only.",
    ],
    related: [
      { label: "Schedule a specific week of social posts", href: "/help/guides/weekly-social-schedule" },
      { label: "Generate listing social posts with AI", href: "/help/guides/generate-leads-ai-content" },
    ],
  },
  {
    slug: "tiktok-posting",
    title: "Choose how your TikTok posts go out",
    description:
      "TikTok requires the account holder to pick the audience and declare commercial content. Until you do, scheduled TikTok posts are skipped.",
    readTime: "3 min",
    category: "marketing",
    body: [
      "TikTok is stricter than the other networks. Its rules say the account holder — not the app — chooses who can see a post and whether it is commercial. CloseBoss publishes on a schedule with nobody present, so you make that choice once here and it is used on every post.",
      "Nothing is preselected, deliberately. Until you pick an audience and save, scheduled TikTok posts are skipped rather than sent to a default you never chose.",
    ],
    steps: [
      "Connect TikTok first, at Settings → Channels & Compliance → Connected social accounts.",
      "On the same tab, find TikTok posting.",
      "Choose who can see these posts. Only the audiences TikTok currently offers your account are listed — if the one you want is missing, that is a setting on TikTok's side, not here.",
      "Set the interaction options. A box that is checked and greyed out is already switched off in your TikTok account settings; CloseBoss cannot re-enable it, and would not be allowed to.",
      "Declare commercial content if it applies: promoting your own business, a paid partnership, or both. TikTok does not allow a paid partnership on a private post — pick a different audience if you need both.",
      "Read the disclosure line and save. Your choice is re-checked against your TikTok account on every post, so if TikTok later withdraws an audience the post fails with a reason instead of going out wrong.",
    ],
    related: [
      { label: "Connect your social accounts", href: "/help/guides/connect-social-accounts" },
      { label: "Schedule a specific week of social posts", href: "/help/guides/weekly-social-schedule" },
    ],
  },
  {
    slug: "weekly-social-schedule",
    title: "Schedule a specific week of social posts",
    description:
      "Pick weekdays, then per day choose text / image / video, a time, the channels, and a topic the AI researches and publishes for you.",
    readTime: "3 min",
    category: "marketing",
    body: [
      "This is the hands-on alternative to autopilot: you choose the days and the topics, the AI does the research, the writing and the publishing.",
      "The post format decides which networks can receive it, so pick the format before the channels.",
    ],
    steps: [
      "Open Settings → Channels & Compliance and find Weekly post schedule.",
      "Pick the weekdays you want a post to go out on.",
      "For each day, choose a format. Text reaches Facebook, LinkedIn and Threads. Image renders a branded card and also reaches Instagram and Pinterest. Video films your digital twin delivering the topic, and reaches Facebook, Instagram, LinkedIn, TikTok and YouTube.",
      "Set the Time, the Channels and a Topic for that day. The AI researches the topic, writes the post and publishes it on schedule.",
      "If you chose Video, set up your Digital Twin first — an intro video plus a cloned voice. Without it, that day will not post.",
      "Save. Days you leave unselected simply do not post.",
    ],
    related: [
      { label: "Let AI run my social media", href: "/help/guides/social-autopilot" },
      { label: "Run a 30-day marketing plan for a new listing", href: "/help/guides/marketing-plans" },
    ],
  },
  {
    slug: "assistant-voice",
    title: "Pick the voice your phone assistant uses",
    description:
      "Choose the preset voice and speaking style for inbound calls, and turn on a bilingual English + Chinese greeting.",
    readTime: "2 min",
    category: "ai-and-voice",
    body: [
      "This controls how your phone assistant sounds to callers. It is separate from the AI's writing voice, which lives on the same tab in the AI settings panel.",
      "Calls use Twilio speech today. The OpenAI and ElevenLabs presets map to Amazon Polly voices until native text-to-speech is connected, and custom voice cloning is not available yet.",
    ],
    steps: [
      "Open Settings → Voice & Style and find Phone Voice.",
      "Choose a Provider (OpenAI or ElevenLabs), then a Preset voice. Each preset names the Twilio voice it maps to today — Alloy is the neutral, balanced default.",
      "Choose a Speaking style: Friendly, Professional or Luxury.",
      "Set the Default language used when bilingual mode is off.",
      "Turn on Bilingual inbound greeting if you want callers greeted in English and Chinese.",
      "Use Preview to hear the Twilio playback before you save.",
      "Save. Assistant disclosure scripts are unchanged by this setting — callers are always told they are speaking with an assistant.",
    ],
    related: [
      { label: "Configure voice AI to answer inbound calls", href: "/help/guides/voice-ai-inbound" },
      { label: "Tune the AI's writing voice and tone", href: "/help/guides/ai-voice-style" },
    ],
  },
  {
    slug: "app-language",
    title: "Switch the app to Chinese",
    description:
      "Change the dashboard language, and set separately which language the AI writes to your contacts in.",
    readTime: "1 min",
    category: "account",
    body: [
      "There are two independent language settings, and mixing them up is a common source of confusion: one changes what you see, the other changes what your contacts receive.",
    ],
    steps: [
      "Open Settings → Voice & Style. The language panel is at the top.",
      "Pick your language. The dashboard switches immediately — this affects your interface only.",
      "To change what the AI writes to contacts, use Default outbound language in the AI Assistant Style panel just below.",
      "Choose Auto (match lead) to have the AI follow each contact's language. This setting only applies when a contact has no language preference of their own — you can override it per contact on the Contacts page.",
    ],
    related: [
      { label: "Tune the AI's writing voice and tone", href: "/help/guides/ai-voice-style" },
      { label: "Pick the voice your phone assistant uses", href: "/help/guides/assistant-voice" },
    ],
  },
];
