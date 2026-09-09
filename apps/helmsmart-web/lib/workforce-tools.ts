/**
 * App-level tool registry for AI employees.
 *
 * The @helm/ai-workforce engine defines the contract (RegisteredTool, ToolHandler,
 * ToolContext) but deliberately contains no business logic — handlers live here,
 * in the app that imports the DNA packages. This file wires those handlers together
 * so the engine can dispatchTool() to real implementations.
 *
 * Currently wires Emma's two scopes (service + communication). Additional employees
 * register their own scopes when they are brought onto the engine in later phases.
 */

import { createToolRegistry, type RegisteredTool, type ToolContext } from "@helm/ai-workforce";
import { orgWriteLocale } from "@/lib/i18n/userLocale";
import { translatorFor } from "@/lib/i18n/translator";
import { getAvailability, bookAppointment, matchOrCreateClient, type BookResult } from "@/lib/booking";
import { recordEmmaBooking } from "@/lib/workforce-attribution";

// ─── Tool input/output shapes ────────────────────────────────────────────────

interface CheckAvailabilityInput {
  appointment_type: string;
  date: string;
}

interface BookAppointmentInput {
  appointment_type?: string;
  service_type?: string;
  start?: string;
  date?: string;
  time?: string;
  caller_name?: string;
}

interface CreateCallbackInput {
  reason?: string;
  caller_name?: string;
}

interface SendSmsInput {
  to: string;
  body: string;
}

/** Natural-language result text for the LLM + optional booking metadata. */
export interface ToolTextResult {
  text: string;
  bookedEventId?: string;
  bookedNote?: string;
  bookedLabel?: string;
  bookedRescheduleToken?: string;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Build the ToolRegistry for Emma handling an SMS conversation.
 * `fromNumber` (the customer's phone) is closed over by the booking handlers so
 * they can match-or-create the client without the LLM passing it explicitly.
 */
export function createSmsReceptionistRegistry(fromNumber: string): ReturnType<typeof createToolRegistry> {
  const tools: RegisteredTool[] = [
    {
      key: "check_availability",
      dnaModule: "service",
      handler: async (input: unknown, ctx: ToolContext): Promise<ToolTextResult> => {
        const { appointment_type: type = "", date } = input as CheckAvailabilityInput;
        const res = await getAvailability(ctx.orgId, type, String(date ?? ""));
        if (res.closed) return { text: `Closed on ${date}. Offer a different day within business hours.` };
        if (res.slots.length === 0) return { text: `No open ${res.durationMinutes}-minute slots on ${date}. Suggest another day.` };
        return {
          text:
            `Open slots (offer these; book with the exact "start"):\n` +
            res.slots.map((s) => `- ${s.label} → start: ${s.startISO}`).join("\n"),
        };
      },
    },
    {
      key: "book_appointment",
      dnaModule: "service",
      handler: async (input: unknown, ctx: ToolContext): Promise<ToolTextResult> => {
        const args = input as BookAppointmentInput;
        const type = String(args.appointment_type ?? args.service_type ?? "");
        const clientId = await matchOrCreateClient(ctx.orgId, fromNumber, args.caller_name ?? null);
        const res: BookResult = await bookAppointment(ctx.orgId, {
          appointmentTypeName: type,
          startISO: args.start,
          dateStr: args.date,
          timeStr: args.time,
          clientId,
          callerName: args.caller_name ?? null,
        });
        if (!res.ok) return { text: `Could not book: ${res.reason} Offer to check another time with check_availability.` };
        // Attribute the booking to Emma (best-effort, never blocks).
        await recordEmmaBooking(ctx.db, ctx.orgId);
        return {
          text: `Booked: ${res.title} on ${res.label}. Confirm this back to the customer.`,
          bookedEventId: res.eventId,
          bookedNote: `${res.title} on ${res.label} (from ${fromNumber})`,
          bookedLabel: res.label,
          bookedRescheduleToken: res.rescheduleToken,
        };
      },
    },
    {
      key: "create_callback",
      dnaModule: "service",
      handler: async (input: unknown, ctx: ToolContext): Promise<ToolTextResult> => {
        const { reason = "Call back requested", caller_name } = input as CreateCallbackInput;
        const clientId = await matchOrCreateClient(ctx.orgId, fromNumber, caller_name ?? null);
        await ctx.db.from("tasks").insert({
          organization_id: ctx.orgId,
          client_id: clientId,
          title: translatorFor(await orgWriteLocale(ctx.orgId, ctx.db), "tasks")(
            "generated.callBack",
            { who: caller_name || fromNumber },
          ),
          notes: `From ${fromNumber}: ${reason}`,
          due_date: new Date().toISOString().slice(0, 10),
          priority: "high",
          status: "open",
        });
        return { text: "Let the customer know someone from the team will call them back." };
      },
    },
    {
      key: "communication.send_sms",
      dnaModule: "communication",
      handler: async (input: unknown, ctx: ToolContext): Promise<ToolTextResult> => {
        // Used when the engine itself needs to send a message as a discrete tool action.
        // In the SMS booking loop the reply is sent by the route after the loop; this
        // handler exists to satisfy the scope declaration and future direct-send use.
        const { body = "" } = input as SendSmsInput;
        return { text: body };
      },
    },
  ];

  return createToolRegistry(tools);
}
