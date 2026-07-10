import type { PlaybookRunDef, PlaybookRunType } from "./types";

/**
 * Phase blueprints for the two stateful playbooks. These describe WHAT the AI
 * team does in each phase (for the run detail UI + the Boss planner). The
 * concrete task templates + generators are wired in ./service.
 *
 * Both playbooks follow the same arc: prep → plan → execute → optimize, where
 * execute + optimize are agent-approved (approval-gated) recurring steps.
 */
export const PLAYBOOK_RUN_DEFS: Record<PlaybookRunType, PlaybookRunDef> = {
  house_selling: {
    type: "house_selling",
    title: "Sell this home",
    trigger: "Start after the listing agreement is signed.",
    phases: [
      {
        key: "prepare",
        kind: "checklist",
        title: "Prepare the property to sell",
        assignee: "transaction_assistant",
        description:
          "Dated prep checklist: pre-listing walk, repairs/declutter/stage, photography + video, confirm pricing, gather disclosures.",
      },
      {
        key: "marketing_plan",
        kind: "generate",
        title: "Create the marketing plan",
        assignee: "marketing_assistant",
        description:
          "AI marketing plan for the property — positioning, channels (MLS/portals/social/email), timeline, and open-house cadence.",
      },
      {
        key: "property_ads",
        kind: "generate",
        title: "Create 3 custom property ads",
        assignee: "marketing_assistant",
        description:
          "Three distinct ad creatives (each with an angle, audience, headline, primary text, CTA) — on top of the standard listing post.",
      },
      {
        key: "execute",
        kind: "execute",
        title: "Execute the marketing plan",
        assignee: "marketing_assistant",
        description:
          "Roll out the plan: portal/social posts, sphere email, open house. Approval-gated — the AI prepares each action for you to approve.",
      },
      {
        key: "optimize",
        kind: "optimize",
        title: "Optimize the marketing plan as we go",
        assignee: "marketing_assistant",
        description:
          "Periodic review: read showings/views/feedback, then adjust price positioning, channels, and ads. The AI proposes; you approve.",
      },
    ],
  },
  house_buying: {
    type: "house_buying",
    title: "Find this buyer a home",
    trigger: "Start after the buyer is qualified.",
    phases: [
      {
        key: "consultation",
        kind: "checklist",
        title: "Set up the buying consultation",
        assignee: "sales_assistant",
        description:
          "Schedule the buyer consultation and prep: needs/wants, must-haves vs nice-to-haves, budget confirmation, timeline.",
      },
      {
        key: "search_plan",
        kind: "generate",
        title: "Create the house-searching plan",
        assignee: "sales_assistant",
        description:
          "Build the search plan — criteria (beds/baths, area, price), how often to send matches, and the communication channel — and save the live search.",
      },
      {
        key: "execute",
        kind: "execute",
        title: "Execute the house-search plan",
        assignee: "sales_assistant",
        description:
          "Run the search and deliver matches on the chosen cadence. Approval-gated — the AI prepares each send for you to approve.",
      },
      {
        key: "optimize",
        kind: "optimize",
        title: "Optimize the search plan as we go",
        assignee: "sales_assistant",
        description:
          "Periodic review: read what the buyer liked/passed on, then tighten criteria, area, or price. The AI proposes; you approve.",
      },
    ],
  },
};

export function getPlaybookRunDef(type: PlaybookRunType): PlaybookRunDef {
  return PLAYBOOK_RUN_DEFS[type];
}
