import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getServerT } from "@/lib/i18n/server";

/**
 * The ARTICLES are written in English and stay that way — a post body is
 * authored prose, not interface copy. Everything around them travels through
 * the `site` bundle: the chrome below, and the post's own title, excerpt,
 * category, date and read time, which live in `site.blog.posts.<slug>` and
 * are shared with the blog index so a card and the page it opens agree.
 */
interface Post {
  body: string; // HTML-safe markdown-ish paragraphs, English
}

const posts: Record<string, Post> = {
  "smb-pains-and-solutions": {
    body: `
Running a small business means wearing every hat at once. You're the salesperson, the scheduler, the bookkeeper, and the technician — often simultaneously. It's no wonder that the same six problems come up again and again when we talk to small business owners.

**1. Missed calls while on the job**

You can't answer the phone when you're elbow-deep in a job. Every missed call is a potential lost customer — and studies show most callers hang up rather than leave a voicemail. HelmSmart's AI Voice Receptionist answers every call 24/7, collects caller details, and books appointments directly to your calendar. No hold music. No voicemail.

**2. Expensive after-hours answering services**

Traditional after-hours services cost $200–$500 per month and still miss nuance. HelmSmart's AI handles after-hours calls for a fraction of that cost, answers your FAQs, and routes urgent calls so nothing falls through the cracks.

**3. 10+ hours a week on admin**

The average service business owner spends over ten hours every week on email, scheduling, and paperwork. HelmSmart's Smart Inbox triages messages by urgency, drafts replies, and surfaces only what actually needs your attention. What used to take an hour takes minutes.

**4. Invoices that go out late — or not at all**

Cash flow problems often trace back to slow invoicing. When you're busy, invoices pile up. HelmSmart auto-generates invoices the moment a job is marked complete and sends automated payment reminders so you get paid faster without awkward follow-up calls.

**5. Double-bookings and scheduling chaos**

Without a real system, scheduling becomes a guessing game. HelmSmart syncs with your Google Calendar and lets clients self-book available slots — so appointments land in the right place automatically, with reminders sent to reduce no-shows.

**6. Leads slipping through the cracks**

When things get busy, follow-ups get dropped. HelmSmart's built-in CRM tracks every client and prospect, flags overdue follow-ups, and keeps your pipeline visible so no deal goes cold by accident.

The common thread: every one of these pains costs you real money. HelmSmart is designed to solve all six in one place — so you can focus on the work that actually grows your business.
    `.trim(),
  },

  "ai-receptionist-guide": {
    body: `
For a plumber, electrician, or cleaning company, the phone is the lifeblood of the business. A customer with a burst pipe isn't going to wait for a callback — they'll call the next number on the list.

**The missed-call problem is bigger than you think**

Research consistently shows that 85% of callers who can't reach a business on the first try won't call back. For a service business averaging 20 inbound calls a week, that's potentially 17 lost opportunities every seven days. Multiply that by your average job value and the math gets uncomfortable fast.

**What AI receptionists actually do**

Modern AI voice systems aren't the robotic phone trees of the 1990s. Today's AI receptionists hold natural conversations, understand context, and can handle the full range of tasks a human receptionist would:

- Answer common questions about services, pricing, and availability
- Book appointments directly into your calendar
- Take detailed messages for calls that need personal follow-up
- Recognize urgency and route emergency calls differently
- Speak multiple languages for non-English-speaking callers

**The cost equation**

A part-time human receptionist costs $1,500–$2,500 per month. A traditional answering service runs $200–$500. An AI receptionist handles unlimited calls for a predictable monthly fee — and never calls in sick.

**What service business owners report**

After switching to AI voice reception, most owners report two immediate changes: fewer leads slipping through the cracks, and significantly less stress during busy periods. When you know every call is answered, you can focus completely on the job in front of you.

**Getting started**

HelmSmart's Voice Agent connects to your existing phone number via Twilio or Retell AI. Setup takes less than 30 minutes: configure your business hours, your common appointment types, and a brief knowledge base about your services. The AI learns your business and handles calls from day one.
    `.trim(),
  },

  "cost-of-admin-work": {
    body: `
Ask any small business owner how much time they spend on admin, and you'll get answers ranging from "too much" to "basically all weekend." The data backs this up: the average service business owner spends 10–15 hours per week on tasks that don't directly generate revenue.

**What counts as admin?**

The list is longer than most people realize:
- Answering repetitive emails and calls
- Scheduling and rescheduling appointments
- Creating and sending invoices
- Chasing late payments
- Categorizing expenses and reconciling bank statements
- Preparing end-of-month reports
- Following up with leads who went quiet

None of these tasks are inherently hard. They're just relentless — and they happen in the margins of the day, fragmenting your focus and eating into time you could spend on billable work.

**Putting a number on it**

If your time is worth $75 an hour and you spend 12 hours a week on admin, that's $900 of productive capacity lost every week — or over $45,000 a year. Even if the real opportunity cost is half that, it's a significant number.

**The compounding effect**

Admin tasks don't just cost you time in the moment. They also interrupt deep work. Every time you stop to answer an email or create an invoice mid-job, you lose context and momentum. Research on context-switching suggests it takes over 20 minutes to fully return to a complex task after an interruption.

**Where automation actually helps**

Not all admin can be automated — some of it requires judgment and relationships. But a significant portion is genuinely repetitive:

- Invoices that follow a template can be auto-generated
- Payment reminders can be sent on a schedule
- Appointment confirmations and reminders can go out automatically
- Expense categorization can be AI-assisted
- Common customer questions can be answered by an AI inbox

HelmSmart is built around the idea that a 1–3 person shop should be able to operate with the efficiency of a 10-person company. The right tools — calendar sync, AI inbox triage, automated invoicing — don't replace judgment. They eliminate the busywork so judgment is what you're spending your time on.
    `.trim(),
  },

  "get-paid-faster": {
    body: `
Cash flow is the number one cause of small business failure — and the irony is that most cash flow problems aren't caused by lack of revenue. They're caused by slow collections. Here are five strategies that consistently shorten the payment cycle.

**1. Invoice immediately**

The single biggest predictor of when you get paid is when you send the invoice. Every day you wait to invoice is a day added to your collection timeline. The best service businesses invoice the moment a job is marked complete — ideally automatically, before they've even packed up their tools.

HelmSmart can auto-generate an invoice the instant you close out a project, with your line items, tax rate, and payment link already populated.

**2. Make it easy to pay**

If paying you requires writing a check, finding an envelope, and locating a stamp, some clients will procrastinate. Accepting online payments via card or bank transfer can cut your average collection time by 5–7 days. Every invoice HelmSmart sends includes a secure Stripe payment link.

**3. Send automated reminders**

Most late payments aren't deliberate — they're forgotten. A gentle automated reminder three days before the due date and again on the due date itself resolves the majority of late payments without any awkward phone calls.

**4. Offer net-15 instead of net-30 by default**

Many businesses default to net-30 terms because it feels professional. But net-15 is perfectly acceptable for most service work, and it gets you paid twice as fast. If you've been using net-30 out of habit, switch to net-15 and see what happens.

**5. Track overdue invoices actively**

An invoice you've forgotten about can't be collected. HelmSmart's dashboard surfaces overdue invoices prominently — by amount, by client, and by how overdue they are — so you always know exactly where your receivables stand and can prioritize collection calls accordingly.

**The compound effect**

Cutting your average payment cycle from 35 days to 20 days might not sound dramatic, but for a business doing $20,000 a month in revenue it means $10,000 more in available cash at any given time. That's the difference between making payroll comfortably and scrambling at the end of the month.
    `.trim(),
  },

  "ai-receptionist-setup": {
    body: `
Getting your AI receptionist live on HelmSmart takes less than 30 minutes if you follow this guide. Here's exactly what to do, in order.

**Step 1: Connect your phone number**

HelmSmart integrates with Twilio for basic call handling and Retell AI for natural, low-latency voice conversations. If you already have a Twilio number, point the voice webhook at your HelmSmart endpoint. If you need a new number, Twilio charges around $1/month for a local US number.

For the best experience, we recommend Retell AI — it produces noticeably more natural conversation than the basic Twilio flow.

**Step 2: Configure your business hours**

In the Voice Agent settings, set your operating hours for each day of the week. The AI will only book appointments within these windows and will inform callers outside your hours that the office is closed.

If your hours vary by season, you can update them anytime and the change takes effect immediately.

**Step 3: Add your appointment types**

Create the types of appointments you offer — for example, "Free Estimate (30 min)", "Standard Service Call (1 hour)", "Emergency Call-Out (2 hours)". For each type, set:

- Name (what the AI calls it in conversation)
- Duration (used to block calendar time and calculate available slots)
- Description (optional context the AI can share with callers)

**Step 4: Build your knowledge base**

This is the most important step for making your AI sound like it knows your business. Add entries for:

- Your services and rough pricing ("We charge $150 for a standard HVAC inspection")
- Service area ("We cover the greater Phoenix metro area")
- What to do in an emergency ("For gas leaks, call 911 first, then us")
- Commonly asked questions ("Yes, we're licensed and insured in Arizona")

The more detail you add here, the more confidently the AI handles calls without needing to escalate.

**Step 5: Write your greeting**

Set a brief, friendly greeting the AI uses to open every call. Something like: "Thanks for calling [Business Name]! This is the AI assistant. How can I help you today?" Keep it short — callers want to get to the point.

**Step 6: Enable the agent and test it**

Turn on the voice agent from the settings panel. Then call your number from a personal phone and run through a few scenarios:

- Book an appointment
- Ask a question that's in your knowledge base
- Ask something that isn't — see how it handles uncertainty

Adjust your knowledge base based on what you discover. Most businesses refine their setup over the first week as real calls come in.

**What to expect**

In the first 30 days, you'll see the AI handling a significant portion of routine calls without human intervention. Review the call transcripts regularly — they're a goldmine for understanding what your customers are asking and how the AI is representing your business.
    `.trim(),
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = await getServerT("site");
  if (!posts[slug]) return { title: t("post.notFoundTitle") };
  return {
    title: t("post.metaTitle", { title: t(`blog.posts.${slug}.title`) }),
    description: t(`blog.posts.${slug}.excerpt`),
  };
}

/*
 * Rendered per request, not prebuilt.
 *
 * This route used to export `generateStaticParams`, which asks Next to
 * generate each post at build time. That is now illegal here: the root layout
 * resolves the reader's language with `getServerLocale()`, which reads
 * `cookies()`, and a request-time API cannot run during static generation. The
 * page throws DYNAMIC_SERVER_USAGE and returns HTTP 500.
 *
 * The trap is that it only happens in a PRODUCTION build. `next dev` renders
 * everything dynamically, so the page looks perfect locally and 500s after
 * deploy. The sibling app learned this the expensive way — roughly 982
 * programmatic SEO pages served 5xx to Google for days, while the pages
 * without a static opt-in were fine.
 *
 * So the whole tree stays dynamic, matching `app/f/[slug]/page.tsx`. Do not
 * add `revalidate` or `generateStaticParams` to any page under this layout
 * without first removing the layout's cookie read for that route.
 */
export const dynamic = "force-dynamic";

function renderBody(body: string) {
  const paragraphs = body.split("\n\n");
  return paragraphs.map((para, i) => {
    if (para.startsWith("**") && para.endsWith("**")) {
      return (
        <h3 key={i} className="mt-8 mb-3 text-xl font-bold text-gray-900">
          {para.slice(2, -2)}
        </h3>
      );
    }
    if (para.startsWith("- ")) {
      const items = para.split("\n").filter((l) => l.startsWith("- "));
      return (
        <ul key={i} className="my-4 space-y-2 list-disc list-inside text-gray-600 leading-relaxed">
          {items.map((item, j) => (
            <li key={j}>{item.slice(2)}</li>
          ))}
        </ul>
      );
    }
    // inline bold
    const parts = para.split(/(\*\*[^*]+\*\*)/g);
    return (
      <p key={i} className="my-4 text-gray-600 leading-relaxed text-base">
        {parts.map((part, j) =>
          part.startsWith("**") && part.endsWith("**") ? (
            <strong key={j} className="font-semibold text-gray-900">
              {part.slice(2, -2)}
            </strong>
          ) : (
            part
          )
        )}
      </p>
    );
  });
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = posts[slug];
  if (!post) notFound();
  const t = await getServerT("site");

  return (
    <div className="bg-white">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium mb-10"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("post.back")}
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
            {t(`blog.posts.${slug}.category`)}
          </span>
          <span className="text-sm text-gray-400">{t(`blog.posts.${slug}.date`)}</span>
          <span className="text-sm text-gray-400">·</span>
          <span className="text-sm text-gray-400">{t(`blog.posts.${slug}.readTime`)}</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-6">
          {t(`blog.posts.${slug}.title`)}
        </h1>

        <p className="text-lg text-gray-500 leading-relaxed border-l-4 border-indigo-200 pl-4 mb-10">
          {t(`blog.posts.${slug}.excerpt`)}
        </p>

        <hr className="border-gray-100 mb-10" />

        <div className="prose-sm max-w-none">{renderBody(post.body)}</div>

        <div className="mt-16 rounded-2xl bg-indigo-600 px-8 py-10 text-center">
          <h2 className="text-2xl font-bold text-white mb-2">
            {t("post.cta.title")}
          </h2>
          <p className="text-indigo-100 mb-6">
            {t("post.cta.subtitle")}
          </p>
          <Link
            href="/signup"
            className="inline-flex items-center rounded-xl bg-white px-6 py-3 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            {t("post.cta.button")}
          </Link>
        </div>
      </div>
    </div>
  );
}
