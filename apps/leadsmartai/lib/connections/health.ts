/**
 * One vocabulary for "is this channel working?", shared by every connect
 * surface. Lives in lib/ rather than beside the component so the rule below is
 * testable — vitest only collects lib/**.
 *
 * The rule that matters: anything that is not `connected` is AMBER, not gray.
 * A channel whose token quietly lost a scope still looks fine from the
 * platform's side, which is how 21 Pinterest posts failed while the connect
 * page displayed the word "error" and nothing else.
 */

export type ConnectionHealthState =
  | "connected"
  | "attention"
  | "disconnected"
  | "unavailable";

export function connectionHealth(
  status: string | null | undefined,
  opts?: { unavailable?: boolean },
): ConnectionHealthState {
  // "Can't be used at all" outranks whatever the row says: an app awaiting
  // platform approval (Pinterest on Trial access, TikTok pre-audit) can hold a
  // perfectly valid token and still publish nothing, and telling the agent to
  // reconnect would waste their time on something they cannot fix.
  if (opts?.unavailable) return "unavailable";
  if (!status) return "disconnected";
  if (status === "connected") return "connected";
  return "attention";
}
