"use client";

import Link from "next/link";

/**
 * One colour grammar for every connected channel.
 *
 * The app had two. Google Calendar signalled health with a whole green card;
 * the Connect platforms page signalled it by a row merely existing, and when a
 * connection went bad it printed the raw enum — the literal word "error" — while
 * the sentence explaining what to do sat unread in `social_accounts.last_error`.
 *
 * The rules, so a glance means the same thing everywhere:
 *
 *   green  — healthy, nothing to do
 *   amber  — YOU must act; always paired with a sentence and a Reconnect
 *   gray   — nothing to act on (not connected, or not available to connect)
 *
 * Brand colour belongs to a network's icon, never to its state. And the forward
 * action (Connect / Reconnect) is the primary button; Disconnect is always
 * quiet, because it is the one thing nobody should click by accident.
 */

export type { ConnectionHealthState } from "@/lib/connections/health";
export { connectionHealth } from "@/lib/connections/health";

import type { ConnectionHealthState } from "@/lib/connections/health";

const DOT: Record<ConnectionHealthState, string> = {
  connected: "bg-green-500",
  attention: "bg-amber-500",
  disconnected: "bg-gray-300",
  unavailable: "bg-gray-300",
};

const PILL: Record<ConnectionHealthState, string> = {
  connected: "bg-green-50 text-green-800 ring-green-200",
  attention: "bg-amber-50 text-amber-900 ring-amber-200",
  disconnected: "bg-gray-50 text-gray-600 ring-gray-200",
  unavailable: "bg-gray-50 text-gray-500 ring-gray-200",
};

/** Compact state marker for a connection row. */
export function ConnectionPill({
  state,
  label,
}: {
  state: ConnectionHealthState;
  label: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${PILL[state]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[state]}`} aria-hidden />
      {label}
    </span>
  );
}

/**
 * The strip under a row that says what went wrong and offers the one action
 * that fixes it. Renders nothing when there is nothing to say — a healthy
 * connection should be quiet.
 *
 * `message` is the platform's own explanation, already rewritten for the agent
 * at the point of failure (see `publish.ts`), so it is shown verbatim rather
 * than flattened into a generic line.
 */
export function ConnectionNotice({
  state,
  message,
  reconnectHref,
  reconnectLabel,
}: {
  state: ConnectionHealthState;
  message?: string | null;
  reconnectHref?: string | null;
  reconnectLabel: string;
}) {
  if (state !== "attention" && state !== "unavailable") return null;
  const text = message?.trim();
  if (!text && state === "unavailable") return null;

  const tone =
    state === "attention"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-gray-200 bg-gray-50 text-gray-600";

  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-xs ${tone}`}>
      <span className="min-w-0 flex-1">{text}</span>
      {state === "attention" && reconnectHref ? (
        <Link
          href={reconnectHref}
          className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700"
        >
          {reconnectLabel}
        </Link>
      ) : null}
    </div>
  );
}
