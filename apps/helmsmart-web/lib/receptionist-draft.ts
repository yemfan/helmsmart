/**
 * Emma's first draft — the business context, greeting, services, FAQs and
 * appointment types a new owner is shown to edit, rather than an empty
 * textarea with a "Business context" label above it.
 *
 * The source, in order: the owner's website if it can be read, then the
 * description they typed, then plain defaults built from the business name.
 * Nothing here is allowed to fail the setup step — every path ends in
 * something the owner can edit, and `source` says which one it took so the
 * screen can tell them the truth about where the words came from.
 *
 * LANGUAGE. The draft is English, in every UI locale, because it is PROMPT
 * content: it is what Emma is briefed with and what she opens a call with, and
 * the receptionist speaks the caller's own language at call time. This is the
 * same rule `components/voice-settings.tsx` already states for its context
 * template and its greeting — see the note at the top of that file. The UI
 * around the draft is translated; the words Emma will say are not.
 */
import Anthropic from "@anthropic-ai/sdk";

import { defaultGreeting } from "@/lib/receptionist-greeting";
import { readSiteText, type SiteReadFailure } from "@/lib/site-profile";

const MODEL = "claude-haiku-4-5";

export type DraftFaq = { title: string; content: string };
export type DraftAppointmentType = { name: string; durationMinutes: number; description: string };

export type ReceptionistDraft = {
  greeting: string;
  /** Goes to organizations.voice_agent_prompt — Emma's business context. */
  context: string;
  services: string[];
  faqs: DraftFaq[];
  appointmentTypes: DraftAppointmentType[];
  /** Where the words came from, so the screen can say so. */
  source: "website" | "description" | "defaults";
  /** The URL actually read, when one was. */
  siteUrl: string | null;
  /** Why the website was not used, when it was offered and not used. */
  siteFailure: SiteReadFailure | null;
};

export type DraftInput = {
  businessName: string;
  website?: string | null;
  description?: string | null;
  category?: string | null;
  location?: string | null;
};

const MAX_FAQS = 4;
const MAX_TYPES = 3;
const MAX_SERVICES = 6;

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}


/**
 * The draft when there is no AI and no site — built only from what the owner
 * typed. Deterministic, so the setup step behaves the same with the key
 * missing as with it present, and the owner is editing real sentences either
 * way.
 */
export function fallbackDraft(
  input: DraftInput,
  siteFailure: SiteReadFailure | null = null,
  siteUrl: string | null = null,
): ReceptionistDraft {
  const name = input.businessName.trim() || "our business";
  const category = clean(input.category, 80);
  const location = clean(input.location, 120);
  const description = clean(input.description, 600);

  const lines = [`## BUSINESS`, `Name: ${name}`];
  if (category) lines.push(`Type of business: ${category}`);
  if (location) lines.push(`Location: ${location}`);
  // The website goes in even when the AI never ran. It was read successfully,
  // and a caller asking "where can I see your prices?" is better served by a
  // URL Emma can read out than by nothing.
  if (siteUrl) lines.push(`Website: ${siteUrl}`);
  if (description) lines.push(`About: ${description}`);
  lines.push(
    "",
    "## APPOINTMENTS & CONTACT",
    "Book callers into the appointment types listed in this account.",
    "If you do not know an answer, take a message with the caller's name, number and reason for calling.",
  );

  return {
    greeting: defaultGreeting(name),
    context: lines.join("\n"),
    services: category ? [category] : [],
    faqs: [],
    appointmentTypes: [
      { name: "Consultation", durationMinutes: 30, description: "An introductory call or visit." },
    ],
    source: description || category ? "description" : "defaults",
    siteUrl,
    siteFailure,
  };
}

/**
 * Coerce whatever the model returned into the draft shape, dropping the rest.
 *
 * Exported for its tests. Model output is untrusted input: it goes into the
 * owner's receptionist prompt and into `upsertAppointmentType`, so every field
 * is length-capped, every list is bounded, and a duration is clamped to the
 * same 5–480 the save clamps to — otherwise the wizard would show a 90-minute
 * slot and store a different one.
 */
export function shapeDraft(parsed: unknown, base: ReceptionistDraft): ReceptionistDraft {
  if (!parsed || typeof parsed !== "object") return base;
  const p = parsed as Record<string, unknown>;

  const greeting = clean(p.greeting, 240) || base.greeting;
  const context =
    typeof p.context === "string" && p.context.trim().length > 20
      ? p.context.trim().slice(0, 4000)
      : base.context;

  const services = Array.isArray(p.services)
    ? p.services.map((s) => clean(s, 80)).filter(Boolean).slice(0, MAX_SERVICES)
    : base.services;

  const faqs = Array.isArray(p.faqs)
    ? (p.faqs as unknown[])
        .map((f) => {
          const o = (f ?? {}) as Record<string, unknown>;
          return { title: clean(o.title ?? o.question, 120), content: clean(o.content ?? o.answer, 600) };
        })
        .filter((f) => f.title && f.content)
        .slice(0, MAX_FAQS)
    : base.faqs;

  const appointmentTypes = Array.isArray(p.appointmentTypes)
    ? (p.appointmentTypes as unknown[])
        .map((a) => {
          const o = (a ?? {}) as Record<string, unknown>;
          const raw = Number(o.durationMinutes);
          return {
            name: clean(o.name, 80),
            // The same clamp `upsertAppointmentType` applies, so nothing is
            // drafted that the save would silently change underneath the owner.
            durationMinutes: Math.min(480, Math.max(5, Math.round(Number.isFinite(raw) ? raw : 30))),
            description: clean(o.description, 300),
          };
        })
        .filter((a) => a.name)
        .slice(0, MAX_TYPES)
    : base.appointmentTypes;

  return {
    ...base,
    greeting,
    context,
    services,
    faqs,
    appointmentTypes: appointmentTypes.length > 0 ? appointmentTypes : base.appointmentTypes,
  };
}

/**
 * Draft Emma's briefing. Reads the website first when one was given; falls
 * back to the typed description, then to defaults. Never throws and never
 * blocks: a site that cannot be read just means the owner edits a thinner
 * draft, and `siteFailure` carries the reason up so the screen can say which.
 */
export async function draftReceptionist(input: DraftInput): Promise<ReceptionistDraft> {
  let siteText = "";
  let siteUrl: string | null = null;
  let siteFailure: SiteReadFailure | null = null;

  const website = (input.website ?? "").trim();
  if (website) {
    const read = await readSiteText(website);
    if (read.ok) {
      siteText = read.text;
      siteUrl = read.url;
    } else {
      siteFailure = read.reason;
    }
  }

  const base = fallbackDraft(input, siteFailure, siteText ? siteUrl : null);

  // No key, no call. `lib/briefing.ts` is the shape being followed: construct
  // the client in the handler after the check, and fall back quietly.
  if (!process.env.ANTHROPIC_API_KEY) return base;
  // Nothing to think about — don't spend a call inventing a business.
  if (!siteText && !clean(input.description, 600) && !clean(input.category, 80)) return base;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const facts = [
      `Business name: ${input.businessName.trim() || "(not given)"}`,
      input.category ? `Category the owner chose: ${clean(input.category, 80)}` : "",
      input.location ? `Location: ${clean(input.location, 120)}` : "",
      input.description ? `What the owner wrote: ${clean(input.description, 600)}` : "",
      siteText ? `Text from their website ${siteUrl}:\n"""\n${siteText}\n"""` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1400,
      system:
        "You brief a small business's AI phone receptionist, named Emma. You write only what the " +
        "source material supports. You never invent prices, guarantees, licence numbers, hours, " +
        "staff names or service areas. If a fact is not in the material, leave it out. Write in " +
        "plain American English — this text is spoken to callers, not read on a page.",
      messages: [
        {
          role: "user",
          content: `${facts}

Draft the receptionist's briefing. Return ONLY a JSON object:
{
  "greeting": "one sentence Emma opens a call with, naming the business",
  "context": "a short markdown briefing with '## BUSINESS' and '## APPOINTMENTS & CONTACT' sections: what the business does, who it serves, what it offers. Facts only, no invented specifics.",
  "services": ["up to ${MAX_SERVICES} services, two or three words each"],
  "faqs": [{"title":"a question callers really ask this business","content":"the answer, from the material only"}],
  "appointmentTypes": [{"name":"what a caller books","durationMinutes":30,"description":"one line"}]
}
At most ${MAX_FAQS} faqs and ${MAX_TYPES} appointmentTypes. If the material does not support an FAQ, return an empty faqs array rather than a made-up one.`,
        },
      ],
    });

    const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return base;
    const draft = shapeDraft(JSON.parse(m[0]) as unknown, base);
    return { ...draft, source: siteText ? "website" : base.source };
  } catch (e) {
    console.error("[setup] receptionist draft failed:", e);
    return base;
  }
}
