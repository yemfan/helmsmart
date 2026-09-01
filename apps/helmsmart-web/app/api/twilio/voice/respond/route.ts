/**
 * Twilio Voice Gather Callback — POST /api/twilio/voice/respond
 *
 * The AI receptionist's turn handler for the INTERIM transport (Twilio gather/say).
 * Claude drives the call with real tool-use: check_availability / book_appointment
 * (booking engine) · create_callback (Task + owner notify) · end_call. The brain
 * (context, prompt, tools, booking side-effects) lives in lib/receptionist-agent so
 * this and the realtime Retell path share one implementation.
 */

import { NextRequest, NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cachedSystem, markTranscriptCached } from "@/lib/promptCache";
import {
  loadReceptionistContext,
  buildVoiceSystemPrompt,
  runReceptionistTool,
  notifyBooking,
} from "@/lib/receptionist-agent";
import Anthropic from "@anthropic-ai/sdk";
import twilio from "twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-sonnet-4-6"; // fast enough for a live call, reliable tool-use
const SUMMARY_MODEL = "claude-haiku-4-5"; // cheap post-call recap, runs after the hangup

/** 1–2 sentence recap of a finished call, for the owner's call log. */
async function summarizeCall(
  transcript: { role: string; content: string }[],
  orgName: string
): Promise<string | null> {
  const dialogue = transcript
    .map((m) => `${m.role === "user" ? "Caller" : "Receptionist"}: ${m.content}`)
    .join("\n");
  if (!dialogue.trim()) return null;
  try {
    const res = await anthropic.messages.create({
      model: SUMMARY_MODEL,
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content:
            `This is a phone call handled by the AI receptionist for ${orgName}. ` +
            `In 1–2 sentences, summarize for the business owner what the caller wanted and the outcome ` +
            `(booked an appointment, left a message, got a question answered). Return ONLY the summary.\n\n${dialogue}`,
        },
      ],
    });
    const block = res.content[0];
    return block?.type === "text" ? block.text.trim() : null;
  } catch (e) {
    console.error("[voice/respond] summarize error:", e);
    return null;
  }
}

function xml(body: string) {
  return new NextResponse(body, { headers: { "Content-Type": "text/xml" } });
}

function endCall(text: string): Response {
  const t = new VoiceResponse();
  t.say({ voice: "Polly.Joanna", language: "en-US" }, text);
  t.hangup();
  return xml(t.toString());
}

function continueCall(text: string): Response {
  const t = new VoiceResponse();
  t.say({ voice: "Polly.Joanna", language: "en-US" }, text);
  const gather = t.gather({
    input: ["speech"],
    action: `${process.env.NEXT_PUBLIC_APP_URL}/api/twilio/voice/respond`,
    method: "POST",
    speechTimeout: "3",
    timeout: 6,
    language: "en-US",
  });
  gather.say({ voice: "Polly.Joanna" }, "");
  t.say({ voice: "Polly.Joanna" }, "I'll let you go. Have a great day!");
  t.hangup();
  return xml(t.toString());
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "check_availability",
    description:
      "Find open appointment slots for an appointment type on a date. ALWAYS call this before offering or booking a time. Returns real openings only — never invent times.",
    input_schema: {
      type: "object",
      properties: {
        appointment_type: { type: "string", description: "The appointment type the caller wants." },
        date: { type: "string", description: "Date to check, formatted YYYY-MM-DD." },
      },
      required: ["appointment_type", "date"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book a specific open slot. Use only a `start` value returned by check_availability, after confirming the time and the caller's name out loud.",
    input_schema: {
      type: "object",
      properties: {
        appointment_type: { type: "string" },
        start: { type: "string", description: "Exact ISO start time from check_availability." },
        caller_name: { type: "string", description: "The caller's name." },
      },
      required: ["appointment_type", "start", "caller_name"],
    },
  },
  {
    name: "create_callback",
    description:
      "Log a request for the team to call the caller back. Use when you can't answer something or the caller wants a person.",
    input_schema: {
      type: "object",
      properties: {
        reason: { type: "string", description: "Why they want a callback / the message to pass on." },
        caller_name: { type: "string", description: "The caller's name, if given." },
      },
      required: ["reason"],
    },
  },
  {
    name: "end_call",
    description: "End the call politely when the caller is done.",
    input_schema: { type: "object", properties: {} },
  },
];

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const callSid = formData.get("CallSid") as string | null;
  const speechResult = formData.get("SpeechResult") as string | null;

  if (!callSid || !speechResult) {
    return endCall("Sorry, I didn't catch that. Please call back anytime. Goodbye!");
  }

  const db = await createServiceClient();
  const { data: session } = await db
    .from("voice_sessions")
    .select("id, organization_id, from_number, messages")
    .eq("call_sid", callSid)
    .single();
  if (!session) {
    return endCall("I'm having trouble with this call. Please try again later. Goodbye!");
  }

  const orgId = session.organization_id as string;
  const fromNumber = session.from_number as string;

  const ctx = await loadReceptionistContext(db, orgId);
  const systemPrompt = buildVoiceSystemPrompt(ctx);

  const prior = (session.messages as { role: "user" | "assistant"; content: string }[]) ?? [];
  const messages: Anthropic.MessageParam[] = prior.map((m) => ({ role: m.role, content: m.content }));
  messages.push({ role: "user", content: speechResult });

  let speech = "";
  let ended = false;
  let bookedEventId: string | null = null;
  let bookedNote: string | null = null;
  let bookedLabel: string | null = null;
  let bookedRescheduleToken: string | null = null;

  try {
    for (let i = 0; i < 5; i++) {
      // A caller on the line waits through every one of these rounds, and each
      // one re-sends the system prompt, all the tool schemas and the whole
      // conversation. Caching the stable prefix cuts what the later rounds
      // cost — and, because a cached prefix is faster to process, shortens the
      // silence the caller sits through.
      markTranscriptCached(messages as never);
      const resp = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 400,
        system: cachedSystem(systemPrompt) as never,
        tools: TOOLS,
        messages,
      });
      const textPart = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (textPart) speech = textPart;

      const toolUses = resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) break;

      messages.push({ role: "assistant", content: resp.content as Anthropic.ContentBlockParam[] });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        if (tu.name === "end_call") {
          ended = true;
          results.push({ type: "tool_result", tool_use_id: tu.id, content: "Call ended." });
          continue;
        }
        const out = await runReceptionistTool(tu.name, tu.input, { db, orgId, fromNumber });
        if (out.bookedEventId) {
          bookedEventId = out.bookedEventId;
          bookedNote = out.bookedNote ?? null;
          bookedLabel = out.bookedLabel ?? null;
          bookedRescheduleToken = out.bookedRescheduleToken ?? null;
        }
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out.text });
      }
      messages.push({ role: "user", content: results });
      if (ended) break;
    }
  } catch (e) {
    console.error("[voice/respond] loop error:", e);
    speech = "I'm having a little trouble right now — let me have someone call you back. Thanks for calling!";
    ended = true;
  }

  if (!speech) speech = ended ? "Thank you for calling. Goodbye!" : "Sorry, could you say that again?";

  const transcript = [...prior, { role: "user", content: speechResult }, { role: "assistant", content: speech }];
  const update: Record<string, unknown> = {
    messages: transcript,
    status: ended ? "completed" : "active",
    updated_at: new Date().toISOString(),
  };
  if (bookedEventId) update.booked_event_id = bookedEventId;
  await db.from("voice_sessions").update(update).eq("call_sid", callSid);

  // Post-response work: booking notify + caller SMS, and a recap when the call ends.
  after(async () => {
    if (bookedEventId) {
      await notifyBooking(db, { orgId, orgName: ctx.orgName, twilioNumber: ctx.twilioNumber }, fromNumber, { bookedNote, bookedLabel, rescheduleToken: bookedRescheduleToken });
    }
    if (ended) {
      const summary = await summarizeCall(transcript, ctx.orgName);
      if (summary) await db.from("voice_sessions").update({ summary }).eq("call_sid", callSid);
    }
  });

  return ended ? endCall(speech) : continueCall(speech);
}
