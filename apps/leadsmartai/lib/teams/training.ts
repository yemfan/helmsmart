/**
 * Brokerage training — the pure half.
 *
 * A class is mandatory or optional, and either scheduled (a date and time,
 * usually a room or a meeting link) or self-paced (a materials link). The
 * status rules live here so the panel, the server and a test agree on them:
 *
 *   done     a completion is on record
 *   overdue  mandatory, not done, and the deadline has passed
 *   due      mandatory, not done, deadline not passed (or no deadline)
 *   open     optional and not done
 *
 * The deadline is the due date, else the class date. Someone who joined the
 * team after that gets NEW_MEMBER_GRACE_DAYS from the day they joined, so a
 * new agent is not "overdue" on a class that was held before they arrived.
 * Every date comparison is a calendar date in one timezone (the viewing
 * account's), never a UTC instant, so "due today" means today where they are.
 * The owner is not tracked: they run the training, they do not take it.
 */

import type { TeamMembership } from "./types";

export type Training = {
  id: string;
  title: string;
  description: string | null;
  required: boolean;
  /** ISO instant of a scheduled class; null = self-paced. */
  startsAt: string | null;
  location: string | null;
  materialsUrl: string | null;
  /** YYYY-MM-DD, mandatory classes only. */
  dueOn: string | null;
  createdBy: string;
  createdAt: string;
};

export type Completion = {
  trainingId: string;
  agentId: string;
  completedAt: string;
  /** Who recorded it: the agent themselves, or a manager. */
  recordedBy: string | null;
};

export type TrainingInput = {
  title: string;
  description: string | null;
  required: boolean;
  startsAt: string | null;
  location: string | null;
  materialsUrl: string | null;
  dueOn: string | null;
};

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const LOCATION_MAX = 300;
export const TRAINING_MAX_ITEMS = 200;
export const NEW_MEMBER_GRACE_DAYS = 30;

export type TrainingField = "title" | "description" | "location" | "materialsUrl" | "startsAt" | "dueOn";
export type TrainingParse =
  | { ok: true; training: TrainingInput }
  | { ok: false; field: TrainingField; reason: "required" | "too_long" | "bad_url" | "bad_date" };

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isCalendarDate(v: string): boolean {
  const m = DATE_RE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function truthy(v: unknown): boolean {
  const s = String(v ?? "").toLowerCase();
  return s === "1" || s === "true" || s === "on" || s === "yes";
}

export function parseTrainingInput(raw: {
  title?: unknown;
  description?: unknown;
  required?: unknown;
  startsAt?: unknown;
  location?: unknown;
  materialsUrl?: unknown;
  dueOn?: unknown;
}): TrainingParse {
  const title = String(raw.title ?? "").trim();
  if (!title) return { ok: false, field: "title", reason: "required" };
  if (title.length > TITLE_MAX) return { ok: false, field: "title", reason: "too_long" };
  const description = String(raw.description ?? "").trim() || null;
  if (description && description.length > DESCRIPTION_MAX) return { ok: false, field: "description", reason: "too_long" };
  const location = String(raw.location ?? "").trim() || null;
  if (location && location.length > LOCATION_MAX) return { ok: false, field: "location", reason: "too_long" };
  const materialsUrl = String(raw.materialsUrl ?? "").trim() || null;
  if (materialsUrl && !isHttpUrl(materialsUrl)) return { ok: false, field: "materialsUrl", reason: "bad_url" };
  const startsRaw = String(raw.startsAt ?? "").trim();
  let startsAt: string | null = null;
  if (startsRaw) {
    const ms = Date.parse(startsRaw);
    if (Number.isNaN(ms)) return { ok: false, field: "startsAt", reason: "bad_date" };
    startsAt = new Date(ms).toISOString();
  }
  const required = truthy(raw.required);
  const dueRaw = String(raw.dueOn ?? "").trim();
  if (dueRaw && !isCalendarDate(dueRaw)) return { ok: false, field: "dueOn", reason: "bad_date" };
  // A due date only means something on a mandatory class.
  const dueOn = required && dueRaw ? dueRaw : null;
  return { ok: true, training: { title, description, required, startsAt, location, materialsUrl, dueOn } };
}

/** The calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function dateIn(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** The class's own deadline: the due date, else the day it is held. */
export function deadlineOf(t: Pick<Training, "dueOn" | "startsAt">, timeZone: string): string | null {
  if (t.dueOn) return t.dueOn;
  if (t.startsAt) return dateIn(t.startsAt, timeZone);
  return null;
}

export type CellStatus = "done" | "overdue" | "due" | "open";

export function statusFor(input: {
  training: Pick<Training, "required" | "dueOn" | "startsAt">;
  done: boolean;
  /** YYYY-MM-DD the member joined, in the same timezone as `today`. */
  joinedOn: string | null;
  today: string;
  timeZone: string;
}): CellStatus {
  if (input.done) return "done";
  if (!input.training.required) return "open";
  const deadline = deadlineOf(input.training, input.timeZone);
  if (!deadline) return "due";
  const grace = input.joinedOn ? addDays(input.joinedOn, NEW_MEMBER_GRACE_DAYS) : null;
  const effective = grace && grace > deadline ? grace : deadline;
  return input.today > effective ? "overdue" : "due";
}

export type MemberState = "current" | "behind" | "in_progress" | "none";

export type MemberSummary = {
  requiredTotal: number;
  requiredDone: number;
  overdue: number;
  optionalDone: number;
  state: MemberState;
};

export function summarizeMember(input: {
  trainings: Training[];
  doneIds: ReadonlySet<string>;
  joinedOn: string | null;
  today: string;
  timeZone: string;
}): MemberSummary {
  let requiredTotal = 0;
  let requiredDone = 0;
  let overdue = 0;
  let optionalDone = 0;
  for (const t of input.trainings) {
    const s = statusFor({ training: t, done: input.doneIds.has(t.id), joinedOn: input.joinedOn, today: input.today, timeZone: input.timeZone });
    if (t.required) {
      requiredTotal += 1;
      if (s === "done") requiredDone += 1;
      if (s === "overdue") overdue += 1;
    } else if (s === "done") {
      optionalDone += 1;
    }
  }
  const state: MemberState = requiredTotal === 0 ? "none" : overdue > 0 ? "behind" : requiredDone === requiredTotal ? "current" : "in_progress";
  return { requiredTotal, requiredDone, overdue, optionalDone, state };
}

/** Members whose training is tracked: everyone but the owner. */
export function trackedMembers(members: TeamMembership[]): TeamMembership[] {
  return members.filter((m) => m.role !== "owner");
}

/**
 * Mandatory first; within each, scheduled classes by date, then self-paced
 * ones by due date, then newest.
 */
export function sortTrainings(list: Training[]): Training[] {
  const key = (t: Training) => t.startsAt ?? (t.dueOn ? `${t.dueOn}T23:59:59.999Z` : null);
  return [...list].sort((a, b) => {
    if (a.required !== b.required) return a.required ? -1 : 1;
    const ka = key(a);
    const kb = key(b);
    if (ka && kb && ka !== kb) return ka < kb ? -1 : 1;
    if (ka && !kb) return -1;
    if (!ka && kb) return 1;
    return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
  });
}

/** Behind first, then in progress, then up to date. */
const STATE_ORDER: Record<MemberState, number> = { behind: 0, in_progress: 1, current: 2, none: 3 };
export function compareMemberStates(a: MemberState, b: MemberState): number {
  return STATE_ORDER[a] - STATE_ORDER[b];
}

export function isUrl(v: string | null): boolean {
  return !!v && isHttpUrl(v);
}
