/**
 * assignee → the AI employee who owns it (name · avatar · profession · team).
 *
 * One roster, two readers. `RunCard` renders it as the badge on a completed
 * step ("Ruby · Marketing Assistant"), and `bossToolsForModel` appends it to
 * every tool description so Max names the same teammate in his prose.
 *
 * Before that second reader existed, Max was guessing: asked to set up an open
 * house he announced "I'll have the Transaction team set up the full open house
 * playbook" while `setup_open_house` is assigned to `marketing_assistant`, so
 * the step underneath his own sentence rendered "Ruby · Marketing Assistant".
 * Nothing was mis-assigned — the work went to the right teammate — but the
 * narration disagreed with the receipt directly below it.
 *
 * `team` is the word Max uses for the group ("the Marketing team"); `role` is
 * the person's title as the UI shows it.
 */
export type AssigneePersona = {
  name: string;
  avatar: string;
  role: string;
  team: string;
};

export const ASSIGNEE_PERSONA: Record<string, AssigneePersona> = {
  receptionist: { name: "Emma", avatar: "emma", role: "Receptionist", team: "Reception" },
  sales_assistant: { name: "Chris", avatar: "chris", role: "Sales Assistant", team: "Sales" },
  marketing_assistant: { name: "Ruby", avatar: "ruby", role: "Marketing Assistant", team: "Marketing" },
  transaction_assistant: { name: "Grace", avatar: "grace", role: "Transaction Coordinator", team: "Transaction" },
  accountant: { name: "Oliver", avatar: "oliver", role: "Accountant", team: "Accounting" },
  boss_assistant: { name: "Max", avatar: "max", role: "Captain", team: "Command" },
};

/** The teammate who owns `assignee`, or null for an unknown/absent one. */
export function personaFor(assignee: string | null | undefined): AssigneePersona | null {
  if (!assignee) return null;
  return ASSIGNEE_PERSONA[assignee] ?? null;
}
