/**
 * Why a button is grey.
 *
 * The codebase's habit was to put the reason in `title=` — "Paste a listing
 * URL first", "Check the consent box first", "Tick the box on any open
 * playbook item to enable". A disabled element receives no mouse events, so
 * none of those tooltips has ever opened in any browser. The reasons were
 * written, some of them carefully, and not one of them reached a user: what
 * the agent got was a faded button and no way to find out what it wanted.
 *
 * Render this beside the control, off the same expression the control gates
 * on, so the button and its explanation cannot drift apart. Pass null when
 * nothing is blocking and it disappears.
 */
export function GateReason({ reason }: { reason: string | null }) {
  if (!reason) return null;
  return <span className="text-[11px] text-slate-500">{reason}</span>;
}
