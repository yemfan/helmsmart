/**
 * Shared result text for the receptionist's custom functions.
 *
 * These strings are not shown to the caller — they are handed back to the LLM as
 * a tool result, so they are instructions about what to do next. That makes them
 * part of the prompt, and the prompt is shared: when `buildSystemPrompt` tells
 * the agent to "call lookup_appointment FIRST … never book a new appointment to
 * stand in for one you cannot see", the tool's own answer has to reinforce the
 * same rule or the instruction only half-lands.
 *
 * Each app keeps its own data access (different tenant columns, different
 * appointment tables) and calls these to phrase the outcome, so the wording
 * cannot drift between apps the way the implementations did.
 *
 * Pure — no database, no tenant assumptions.
 */

import { spokenDateTimeLabel } from "./datetime";

/** One upcoming appointment, in whatever shape the app's table stores it. */
export type UpcomingAppointment = { title: string | null; start_at: string };

/**
 * Who the agent should say will handle a change it can't make itself.
 * "the Realtor" for a real-estate tenant, "the team" for everyone else — the one
 * word that legitimately differs between apps, so it is a parameter rather than
 * a reason to copy the whole string.
 */
export type OwnerNoun = string;

/**
 * lookup_appointment found nothing.
 *
 * The important half is the second sentence. Told only "none found", an agent
 * that has just been asked to confirm an appointment will book a new one to
 * produce the confirmation it was asked for.
 */
export const NO_UPCOMING_APPOINTMENT_TEXT =
  "No upcoming appointment on file for this caller. Say so plainly. If they are sure they " +
  "have one, do NOT book a new one to cover it — take a message with create_callback so " +
  "someone can check.";

/** Render the caller's appointments as one spoken list: "Monday, June 2 at 11 AM (Showing); …" */
export function appointmentListText(rows: UpcomingAppointment[], timezone: string): string {
  return rows
    .map((r) => `${spokenDateTimeLabel(r.start_at, timezone)}${r.title ? ` (${r.title})` : ""}`)
    .join("; ");
}

/**
 * lookup_appointment found one or more appointments.
 *
 * Says what they have AND forbids the two wrong moves: booking a duplicate, and
 * promising a change the agent has no tool to make.
 */
export function existingAppointmentsText(
  rows: UpcomingAppointment[],
  timezone: string,
  owner: OwnerNoun
): string {
  return (
    `This caller already has: ${appointmentListText(rows, timezone)}. Confirm that back to them. ` +
    "Do NOT book another appointment unless they clearly want an ADDITIONAL one — if they want " +
    `this one moved or cancelled, say ${owner} will take care of it and use create_callback.`
  );
}

/**
 * A tool name we don't implement.
 *
 * Never "Done." — that reads as a completed action, and the agent carries on as
 * though the thing happened.
 */
export const UNSUPPORTED_TOOL_TEXT = "Unsupported request — take a message instead.";
