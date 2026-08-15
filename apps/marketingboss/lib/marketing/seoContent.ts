/**
 * Public SEO content registry for marketingbossai.com.
 *
 * Everything indexable that isn't the homepage lives here: how-to guides at
 * /guides/<slug> and comparison pages at /compare/<slug>. The dynamic routes,
 * the index pages and the sitemap all read from these arrays, so adding a page
 * is a single append — no route file, no sitemap edit.
 *
 * Product facts (credit costs, free-credit grant, platform list) are stated in
 * one place here and must match `lib/billing.ts` and the publish adapters. A
 * test asserts the credit numbers against the real pricing so a repricing can't
 * silently leave stale claims on public pages.
 */

import { CREDIT_COST } from "@/lib/creditCosts";

/** New accounts start here — granted by the handle_new_user trigger. */
export const FREE_CREDITS = 40;

// Re-exported so pages import prices and copy from one module. The values come
// from lib/creditCosts, which the generation pipeline also charges against, so
// a quoted price can't drift from the real one.
export { CREDIT_COST };

/** Every channel MarketingBoss can publish to today. */
export const PLATFORMS = [
  "Facebook",
  "Instagram",
  "Threads",
  "LinkedIn",
  "Pinterest",
  "YouTube",
  "TikTok",
] as const;

export type GuideSection = { heading: string; body: string };

export type Guide = {
  slug: string;
  /** Page <h1> and <title> base — lead with the query being targeted. */
  title: string;
  /** Meta description + index-card blurb. Keep under ~155 chars. */
  description: string;
  /** Short label for the index grid. */
  category: "Publishing" | "Creative" | "Strategy";
  /** Opening paragraph under the h1. */
  intro: string;
  /**
   * Ordered steps. Rendered visibly AND as HowTo JSON-LD, so the SERP snippet
   * and the page can never drift apart.
   */
  steps: Array<{ name: string; text: string }>;
  /** Longer-form sections after the steps. */
  sections: GuideSection[];
  faq: Array<{ q: string; a: string }>;
  /** Slugs of related guides shown at the foot of the page. */
  related?: string[];
};

export const GUIDES: Guide[] = [
  {
    slug: "how-to-schedule-social-media-posts",
    title: "How to schedule social media posts across every platform",
    description:
      "A practical walkthrough for scheduling posts to Facebook, Instagram, LinkedIn, Pinterest, TikTok, Threads and YouTube from one place.",
    category: "Publishing",
    intro:
      "Posting by hand doesn't fail because it's difficult — it fails because it depends on you being free at the right moment. Scheduling moves the work to when you have time and the publishing to when your audience is actually awake. Here's how to set that up once and stop thinking about it.",
    steps: [
      {
        name: "Connect your accounts",
        text: "Authorise each channel once. MarketingBoss stores a per-channel token, so a disconnected Instagram never blocks a LinkedIn post.",
      },
      {
        name: "Decide your cadence before your content",
        text: "Pick the days you'll post and stick to them. Three consistent days beats seven sporadic ones — every platform's ranking rewards regularity more than volume.",
      },
      {
        name: "Create the post",
        text: "Write a prompt describing the creative you want. MarketingBoss renders the image or video and drafts a caption sized for each destination.",
      },
      {
        name: "Choose per-platform destinations",
        text: "The same creative rarely fits everywhere. Vertical video belongs on Reels, TikTok and Shorts; a square graphic suits the feed. Send each asset only where it fits.",
      },
      {
        name: "Schedule and confirm",
        text: "Set the date and time, then verify it in the queue. A scheduled post that never appears in a queue view was never actually scheduled.",
      },
    ],
    sections: [
      {
        heading: "Scheduling isn't the same as automating",
        body: "Scheduling moves a post you already made to a future time. Automation decides what to make in the first place. Most tools only do the first — you still supply every asset and every caption, which is where the real hours go. MarketingBoss's weekly autopilot does the second: pick your days, and it researches a topic, generates the creative, writes the caption and posts on schedule.",
      },
      {
        heading: "How far ahead should you schedule?",
        body: "Two weeks is the sweet spot for most accounts. Further out and your content stops responding to anything happening in your market; closer in and you're back to posting reactively. Keep a couple of slots deliberately empty each week so you can react to something timely without tearing up the calendar.",
      },
      {
        heading: "What to check before you queue a batch",
        body: "Confirm the aspect ratio matches the destination, that any link in the caption actually resolves, and that your first line works as a hook on its own — most platforms truncate the caption after roughly one line in the feed. If the post depends on a date or a price, verify it will still be accurate on the day it publishes.",
      },
    ],
    faq: [
      {
        q: "Does scheduling reduce reach?",
        a: "No. This is a persistent myth. Platforms rank on engagement signals — how quickly people stop, watch, and interact — not on whether a post arrived through the API or the app. A scheduled post that lands when your audience is online will out-perform a manual post that lands when they're asleep.",
      },
      {
        q: "What happens if a platform rejects a scheduled post?",
        a: "It's recorded as a failure against that channel and the other channels still publish. The usual causes are an expired token, a video that exceeds the platform's length or size limit, or a missing permission scope on the connected app.",
      },
      {
        q: "Can I schedule to several platforms at once?",
        a: "Yes — one creative can fan out to any combination of the seven supported channels, with the caption adapted per platform.",
      },
    ],
    related: ["social-media-posting-schedule", "how-to-make-vertical-video-for-reels-and-tiktok"],
  },
  {
    slug: "ai-generated-social-media-content",
    title: "AI-generated social media content: what works and what doesn't",
    description:
      "Where AI genuinely helps with social content, where it produces obvious filler, and how to prompt for creative that stops the scroll.",
    category: "Creative",
    intro:
      "AI is very good at the part of social media that is expensive and repetitive, and noticeably bad at the part that makes an account worth following. Knowing which is which is most of the skill.",
    steps: [
      {
        name: "Start from a specific visual idea, not a topic",
        text: "\"Social post about our sale\" produces filler. \"Sunlit overhead shot of the new sneaker on concrete, hard shadows, 9:16\" produces something usable. Name the subject, the light, the angle and the aspect ratio.",
      },
      {
        name: "Give it your real product",
        text: "Drop in a reference photo so the render riffs on your actual product rather than inventing a generic one. This is the single biggest jump in output quality.",
      },
      {
        name: "Generate several, keep one",
        text: "At 1 credit per image, generating six and discarding five is the correct workflow. Judge them at thumbnail size — that's how they'll be seen.",
      },
      {
        name: "Write the caption yourself when it matters",
        text: "Let AI draft, then rewrite the first line. The hook is where a human voice is worth the most and where generated copy is most obviously generated.",
      },
      {
        name: "Check it against reality before posting",
        text: "AI will happily render a product in a colour you don't sell. Verify anything a customer could hold you to — colours, features, prices, claims.",
      },
    ],
    sections: [
      {
        heading: "What AI is genuinely good at here",
        body: "Volume and variation. Ten aspect ratios of the same concept, twenty background treatments, a month of thumbnails in a consistent style. It's also good at the blank-page problem: a mediocre first draft you react against is more useful than an empty editor.",
      },
      {
        heading: "What it's bad at",
        body: "Opinions, specifics, and anything that requires having been somewhere. Generated copy defaults to the average of everything written about a topic, which is exactly the register people scroll past. Text rendered inside an image is still unreliable — put your words in the caption or an overlay, not baked into the render.",
      },
      {
        heading: "A prompt that works, dissected",
        body: "\"Cinematic close-up of a matcha latte on a pale oak table, morning window light from the left, shallow depth of field, steam visible, 9:16 vertical.\" It names the subject, the surface, the light direction, the lens behaviour, one moving detail, and the format. Every one of those does work. Drop any of them and the model picks for you.",
      },
    ],
    faq: [
      {
        q: "Will people be able to tell it's AI?",
        a: "For product photography and abstract or graphic backgrounds, usually not. For human faces and hands, often yes. If your brand depends on showing real people, use AI for the surrounding creative and real footage for the people.",
      },
      {
        q: "Do I need to disclose AI-generated content?",
        a: "Several platforms now ask you to label synthetic media, and the rules differ by platform and change frequently. Check the current policy for each channel you post to — and label it when in doubt, since the penalty for undisclosed synthetic media is generally worse than the cost of a label.",
      },
      {
        q: "How much does it cost to generate?",
        a: `An image is ${CREDIT_COST.image} credit, an edit or restyle is ${CREDIT_COST.edit}, and a cinematic video clip is ${CREDIT_COST.video}. Every account starts with ${FREE_CREDITS} free credits and no card.`,
      },
    ],
    related: ["how-to-make-ugc-style-video-ads", "how-to-make-vertical-video-for-reels-and-tiktok"],
  },
  {
    slug: "how-to-make-ugc-style-video-ads",
    title: "How to make UGC-style video ads",
    description:
      "Why creator-style ads outperform polished brand films, and how to produce them without hiring a creator for every concept.",
    category: "Creative",
    intro:
      "UGC-style ads work because they don't look like ads. They look like something a person made on a phone — and that read buys you two or three seconds of attention that a glossy brand film never gets, because the viewer hasn't yet classified it as something to skip.",
    steps: [
      {
        name: "Lead with the hook, not the brand",
        text: "The first two seconds decide everything. Open on the problem, a result, or an unexpected visual. A logo in second one is an instruction to scroll.",
      },
      {
        name: "Shoot vertical and imperfect",
        text: "9:16, handheld feel, natural light. Production polish actively hurts here — it signals 'advertisement' before a single word lands.",
      },
      {
        name: "Structure it: hook, problem, product, proof, ask",
        text: "Five beats in under thirty seconds. Each one earns the next. Cut anything that doesn't move you to the next beat.",
      },
      {
        name: "Study what already worked",
        text: "Find creator ads in your category that performed, and borrow the structure — the pacing, the hook shape, the moment the product appears — not the script.",
      },
      {
        name: "Make several and let spend decide",
        text: "UGC creative has a short shelf life. Produce variations of the hook against the same body and let the numbers pick the winner rather than your taste.",
      },
    ],
    sections: [
      {
        heading: "Why the polished version underperforms",
        body: "People have a fast, well-trained classifier for advertising, and high production values are its strongest input. A slightly wobbly vertical clip with imperfect lighting slips past that classifier long enough for the message to land. You are not trying to look cheap — you are trying to look like a person.",
      },
      {
        heading: "Doing this without a creator on retainer",
        body: "The expensive part of UGC is the per-concept cost of briefing, shooting and re-shooting. Generating the creative removes that: a hook that doesn't work costs you a render rather than a shoot day, so you can afford to be wrong most of the time — which is the only way to find the one that works.",
      },
    ],
    faq: [
      {
        q: "How long should a UGC-style ad be?",
        a: "Fifteen to thirty seconds. Long enough for hook, problem, product and ask; short enough that a viewer who's mildly interested doesn't have to decide whether to commit.",
      },
      {
        q: "Does this work outside e-commerce?",
        a: "Yes. The format is about the register, not the category — it works anywhere the buyer is a person scrolling. It works less well where the buyer is a committee reading a document.",
      },
    ],
    related: ["ai-generated-social-media-content", "how-to-make-vertical-video-for-reels-and-tiktok"],
  },
  {
    slug: "how-to-make-vertical-video-for-reels-and-tiktok",
    title: "How to make vertical video for Reels, TikTok and Shorts",
    description:
      "The format rules that actually matter for short vertical video, and how to produce clips that work on all three without three separate edits.",
    category: "Creative",
    intro:
      "Reels, TikTok and Shorts are three front doors to the same behaviour: a full-screen vertical video, judged in the first second, watched with the sound off as often as on. Build for that and one clip serves all three.",
    steps: [
      {
        name: "Compose for 9:16, always",
        text: "Full-bleed vertical. A landscape clip letterboxed into a vertical frame wastes two-thirds of the screen and reads as repurposed.",
      },
      {
        name: "Keep the important part out of the corners",
        text: "Each platform stacks its own UI over your video — captions, handles, buttons. Keep your subject and any text in the middle band.",
      },
      {
        name: "Make it work silent",
        text: "Assume the sound is off. If the clip is unintelligible without audio, it's unintelligible to most of your audience.",
      },
      {
        name: "Earn the first second",
        text: "Motion, a face, or an unexpected image immediately. A slow establishing shot is a scroll.",
      },
      {
        name: "Publish natively to each channel",
        text: "Upload the file to each platform rather than sharing a link. Every platform demotes content that sends people away from it.",
      },
    ],
    sections: [
      {
        heading: "One clip, three platforms — where it breaks",
        body: "The format is shared; the limits are not. Maximum duration, file size and caption length all differ by platform and change over time. When a multi-channel post partly fails, an over-limit video is the most common cause — check the length and file size against the strictest destination in your set.",
      },
      {
        heading: "Bringing a still to life",
        body: "You don't need footage to publish video. A single strong product photo can be animated into a short clip with camera movement, which for many accounts is the cheapest route to a video habit. It costs the same as any other clip.",
      },
    ],
    faq: [
      {
        q: "Do I need different edits per platform?",
        a: "Usually not. Build one 9:16 clip with the subject centred and it will serve Reels, TikTok and Shorts. Re-edit only when a specific platform's length limit forces it.",
      },
      {
        q: "How long should the clip be?",
        a: "Short enough to loop. Under fifteen seconds gives you replays, and replays are among the strongest ranking signals on every short-video surface.",
      },
    ],
    related: ["how-to-make-ugc-style-video-ads", "how-to-schedule-social-media-posts"],
  },
  {
    slug: "social-media-posting-schedule",
    title: "Building a social media posting schedule you'll actually keep",
    description:
      "How often to post, how to pick your days, and how to build a cadence that survives a busy week without collapsing.",
    category: "Strategy",
    intro:
      "Most posting schedules fail in week three. Not because the strategy was wrong, but because it was built for an imaginary version of you with more time. A schedule you keep at half the volume beats an ambitious one you abandon.",
    steps: [
      {
        name: "Start at three days a week",
        text: "Three is sustainable and enough for every platform to read you as active. Add days later from a position of strength rather than cutting back from failure.",
      },
      {
        name: "Pick fixed days, not a weekly quota",
        text: "'Tuesday, Thursday, Saturday' survives a busy week. 'Three times a week' silently becomes zero times by Friday.",
      },
      {
        name: "Batch creation, separate it from publishing",
        text: "Make a fortnight of creative in one sitting when you have energy. Publishing then costs nothing on the day.",
      },
      {
        name: "Reserve one reactive slot",
        text: "Leave a slot each week deliberately empty for something timely. Without it, a fully-booked calendar makes you choose between your plan and the moment.",
      },
      {
        name: "Review monthly, not daily",
        text: "Daily numbers are noise. Once a month, look at which posts earned saves and shares, and do more of that.",
      },
    ],
    sections: [
      {
        heading: "How often is actually right?",
        body: "Consistency beats frequency at every level below daily. An account posting three times a week for a year outperforms one posting daily for six weeks and then going quiet — both in absolute reach and in how the platform treats subsequent posts. Pick the highest cadence you can hold for twelve months.",
      },
      {
        heading: "Best time to post",
        body: "Published 'best time' charts are averages across millions of accounts that look nothing like yours. Use them only as a starting guess, then read your own analytics after a month. The one durable rule: post when your audience is awake, which for a local business means their timezone, not yours.",
      },
      {
        heading: "When to let it run itself",
        body: "If your schedule keeps collapsing on the creation step rather than the publishing step, the fix is automation, not discipline. A weekly autopilot that researches a topic, generates the creative and posts on your chosen days removes the step that actually breaks.",
      },
    ],
    faq: [
      {
        q: "Is it bad to post the same thing to every platform?",
        a: "Identical cross-posting is fine for the asset and poor for the caption. Keep the creative; rewrite the caption per platform. What reads well on LinkedIn reads stiff on TikTok.",
      },
      {
        q: "What if I miss a scheduled day?",
        a: "Skip it and post on the next scheduled day. Doubling up to 'catch up' trains you to treat the schedule as negotiable, which is how it stops working.",
      },
    ],
    related: ["how-to-schedule-social-media-posts", "ai-generated-social-media-content"],
  },
  {
    slug: "how-to-automate-pinterest-pins",
    title: "How to automate Pinterest pins",
    description:
      "Pinterest rewards steady publishing more than almost any other platform. Here's how to automate pinning without tripping its spam rules.",
    category: "Publishing",
    intro:
      "Pinterest behaves less like a social feed and more like a search engine with pictures. Pins keep earning impressions for months, which makes it the platform where consistent automated publishing pays back the most — provided you respect how it treats repetition.",
    steps: [
      {
        name: "Use a business account",
        text: "Required for API publishing, and it's what unlocks analytics. Personal accounts can't be automated.",
      },
      {
        name: "Claim your website",
        text: "Claiming attributes every Pin from your domain back to you and unlocks per-Pin analytics. It's a meta tag in your site's head.",
      },
      {
        name: "Organise boards by search intent",
        text: "Board names are indexed. Name them the way people search — not with internal branding nobody types into a search box.",
      },
      {
        name: "Design tall, readable at thumbnail size",
        text: "2:3 is the native ratio. Most Pins are judged at a fraction of full size, so text must be legible small or not present at all.",
      },
      {
        name: "Publish steadily, vary the creative",
        text: "A few Pins a day, every day, beats a burst. Vary the image each time — repeatedly pinning near-identical creative to the same board is what triggers spam heuristics.",
      },
    ],
    sections: [
      {
        heading: "Why Pinterest suits automation",
        body: "The half-life of a Pin is measured in months rather than hours, so today's automated publishing keeps compounding long after it ran. That inverts the usual trade-off: on a fast feed, automated content risks feeling stale; on Pinterest, the steady drip is the strategy.",
      },
      {
        heading: "Staying inside the rules",
        body: "Pinterest's spam signals are aimed at bulk-identical pinning, not at automation itself. Keep each Pin visually distinct, spread them across relevant boards rather than dumping into one, and make sure every destination link resolves — broken links are treated harshly.",
      },
    ],
    faq: [
      {
        q: "How many Pins per day is safe?",
        a: "A handful of genuinely distinct Pins a day is comfortably normal for a business account. The risk comes from bulk-identical creative, not from the count.",
      },
      {
        q: "Do I need to claim my site to publish?",
        a: "No, publishing works without it — but claiming is what attributes Pins to your brand and gives you analytics, so do it before you build up volume.",
      },
    ],
    related: ["how-to-schedule-social-media-posts", "social-media-posting-schedule"],
  },
];

export function getGuide(slug: string): Guide | null {
  return GUIDES.find((g) => g.slug === slug) ?? null;
}

/**
 * Comparison pages.
 *
 * Deliberately written to describe OUR capabilities concretely and the other
 * product only at the level of its own public positioning. We don't assert
 * competitor prices or feature details that go stale and would be unfair to
 * get wrong — every page carries a note pointing readers to the vendor for
 * current details. Naming a competitor to describe a real difference is
 * ordinary nominative use; implying endorsement is not.
 */
export type Comparison = {
  slug: string;
  /** The other product, in its own capitalisation. */
  competitor: string;
  title: string;
  description: string;
  /** How they position themselves — kept high-level and uncontroversial. */
  theirFocus: string;
  /** The honest one-line summary of who should pick which. */
  verdict: string;
  /** Where we differ. `us` must be true of the shipped product. */
  differences: Array<{ dimension: string; us: string; them: string }>;
  /** Cases where the other product is the better choice. Keep this honest. */
  chooseThemIf: string[];
  faq: Array<{ q: string; a: string }>;
};

const CREATIVE_ROW = {
  dimension: "Where the creative comes from",
  us: "Generated for you. Describe what you want and the image or video is rendered, then captioned and queued.",
  them: "You supply it. The tool schedules and publishes assets you've already produced elsewhere.",
};

export const COMPARISONS: Comparison[] = [
  {
    slug: "marketingboss-vs-buffer",
    competitor: "Buffer",
    title: "MarketingBoss vs Buffer",
    description:
      "Buffer schedules the content you make. MarketingBoss makes the content and then schedules it. How to tell which one your workflow actually needs.",
    theirFocus:
      "Buffer is a long-established social scheduling tool, known for a clean queue-based workflow and straightforward multi-channel publishing.",
    verdict:
      "If you already have a designer or a stocked content library, a dedicated scheduler is a fine choice. If the bottleneck is producing the creative in the first place, scheduling software won't fix it.",
    differences: [
      CREATIVE_ROW,
      {
        dimension: "What you pay for",
        us: `Credits for what you generate — ${CREDIT_COST.image} per image, ${CREDIT_COST.video} per video clip. No seats. ${FREE_CREDITS} free credits to start, no card.`,
        them: "Typically a recurring subscription scaled by connected channels or seats.",
      },
      {
        dimension: "Autopilot",
        us: "Pick your weekdays and it researches a topic, generates the creative, writes the caption and posts — unattended.",
        them: "Scheduling automation: your queue publishes itself, but you fill the queue.",
      },
    ],
    chooseThemIf: [
      "You have a designer, an agency, or an existing library, and creative volume isn't your constraint.",
      "You need deep team workflow — approval chains, roles, shared inboxes across a large marketing org.",
      "Your priority is analytics depth on content you already produce, rather than producing more of it.",
    ],
    faq: [
      {
        q: "Can MarketingBoss replace a scheduler outright?",
        a: `It publishes to ${PLATFORMS.length} channels — ${PLATFORMS.join(", ")} — on a schedule, so for most solo operators and small teams, yes. Large teams needing multi-stage approval workflows will find a dedicated enterprise scheduler more mature.`,
      },
      {
        q: "Can I use both?",
        a: "Yes, and some people do — generate in MarketingBoss, download, and publish through whatever tool your team already lives in.",
      },
    ],
  },
  {
    slug: "marketingboss-vs-hootsuite",
    competitor: "Hootsuite",
    title: "MarketingBoss vs Hootsuite",
    description:
      "Hootsuite is built for teams managing many accounts. MarketingBoss is built for producing the creative. Which fits depends on your bottleneck.",
    theirFocus:
      "Hootsuite is an established enterprise social media management platform, focused on managing many accounts across a team with monitoring, approvals and reporting.",
    verdict:
      "Hootsuite is a management layer over accounts you already run. MarketingBoss is a production line for the content that goes into them. They solve different problems.",
    differences: [
      CREATIVE_ROW,
      {
        dimension: "Who it's shaped for",
        us: "Solo operators and small teams who need output, not process. No seats to buy.",
        them: "Marketing teams coordinating many accounts, with roles, approvals and monitoring.",
      },
      {
        dimension: "Time to first post",
        us: "Minutes. Connect a channel, describe a post, publish — free credits, no card.",
        them: "Longer by design; the value is in configured workflow, which takes setup.",
      },
    ],
    chooseThemIf: [
      "You manage social for many brands or clients and need account-level permissions and approvals.",
      "Social listening and inbox monitoring are core to your job, not an extra.",
      "Your organisation requires enterprise reporting, audit trails or compliance controls.",
    ],
    faq: [
      {
        q: "Is MarketingBoss suitable for an agency?",
        a: "For creative production, yes — the Studio plan is sized for heavy campaign volume. For managing dozens of client accounts with separate logins and approval chains, a dedicated management platform will fit better today.",
      },
    ],
  },
  {
    slug: "marketingboss-vs-later",
    competitor: "Later",
    title: "MarketingBoss vs Later",
    description:
      "Later is known for visual planning and a drag-and-drop grid. MarketingBoss generates the visuals. Here's how the two workflows differ.",
    theirFocus:
      "Later is a visual-first scheduling tool, well known for planning an Instagram feed's look ahead of time with a drag-and-drop calendar and grid preview.",
    verdict:
      "Later helps you arrange images you have. MarketingBoss helps you have images. If your grid is half-empty because shooting is the hard part, planning tools don't help.",
    differences: [
      CREATIVE_ROW,
      {
        dimension: "Video",
        us: `Cinematic clips generated from a prompt or a still — ${CREDIT_COST.video} credits each. No footage required.`,
        them: "Schedules video you've already shot and edited.",
      },
      {
        dimension: "Planning model",
        us: "Pick weekdays and let autopilot fill them, or compose posts one at a time.",
        them: "Visual calendar and grid preview — strong if curating a feed's aesthetic is the priority.",
      },
    ],
    chooseThemIf: [
      "Your Instagram grid aesthetic is the priority and you want to arrange it visually before publishing.",
      "You already shoot your own photography and just need it planned and scheduled.",
      "You want link-in-bio tooling as part of the same product.",
    ],
    faq: [
      {
        q: "Can I preview how my feed will look?",
        a: "MarketingBoss saves every render to a gallery you can browse and reuse, but it doesn't simulate an Instagram grid layout. If feed-level visual curation is central to your work, a visual planner is the better tool for that specific job.",
      },
    ],
  },
  {
    slug: "marketingboss-vs-canva",
    competitor: "Canva",
    title: "MarketingBoss vs Canva",
    description:
      "Canva is a design editor you drive. MarketingBoss generates finished creative and publishes it. When each one is the right tool.",
    theirFocus:
      "Canva is a widely used design tool built around templates and a drag-and-drop editor, giving you direct manual control over a design.",
    verdict:
      "Canva is for when you know exactly what you want and are willing to build it. MarketingBoss is for when you want the output and not the editing session.",
    differences: [
      {
        dimension: "How you work",
        us: "Describe the result; the render arrives. Iterate by re-prompting or restyling for 2 credits.",
        them: "Build it yourself from a template with direct control over every element.",
      },
      {
        dimension: "Publishing",
        us: `Publishes directly to ${PLATFORMS.length} connected channels, on a schedule, with per-platform captions.`,
        them: "Primarily a design tool; publishing is secondary to the editor.",
      },
      {
        dimension: "Where each wins",
        us: "Volume and variation — many concepts, fast, without an editing session each time.",
        them: "Precision — exact brand layouts, specific copy placement, deliberate typography.",
      },
    ],
    chooseThemIf: [
      "You need pixel-level control over a specific layout — a deck, a poster, a precise brand template.",
      "Your brand requires exact typography and placement that generated creative won't reliably hit.",
      "You enjoy designing and the editor is not the bottleneck for you.",
    ],
    faq: [
      {
        q: "Do I have to choose?",
        a: "No, and the pairing is common: generate a striking background or product shot in MarketingBoss, then take it into a design editor if you need exact text placement over it.",
      },
      {
        q: "Can MarketingBoss put text on an image?",
        a: "Text rendered inside generated images is still unreliable across all AI image models. Put your words in the caption, or overlay them in a design tool afterwards.",
      },
    ],
  },
];

export function getComparison(slug: string): Comparison | null {
  return COMPARISONS.find((c) => c.slug === slug) ?? null;
}

/** Every public content URL, for the sitemap. */
export function contentRoutes(): string[] {
  return [
    "/guides",
    ...GUIDES.map((g) => `/guides/${g.slug}`),
    "/compare",
    ...COMPARISONS.map((c) => `/compare/${c.slug}`),
  ];
}
