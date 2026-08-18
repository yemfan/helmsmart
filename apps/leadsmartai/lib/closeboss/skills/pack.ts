import {
  SKILLS,
  PILLAR_LABEL,
  ASSIGNEE_LABEL,
  GLOBAL_PREAMBLE,
  type SkillPillar,
} from "./catalog";

/**
 * The downloadable Realtor AI Skills Library pack — generated FROM the catalog,
 * so the free download never drifts from what's in the product. Markdown: the
 * global preamble, placeholder legend, and all 59 skills (value + prompt +
 * owning assistant) grouped by pillar, plus a compliance note + disclaimer.
 */

const PILLAR_ORDER: SkillPillar[] = [
  "lead_gen", "nurture", "valuation", "listing", "buyer", "negotiation", "compliance", "communication", "operations",
];

export function buildSkillsPackMarkdown(): string {
  const lines: string[] = [];
  const count = SKILLS.length;

  lines.push("# The Realtor AI Skills Library");
  lines.push("");
  lines.push(
    `${count} ready-to-run AI skills for real estate agents — each with the value it captures and a compliance-baked prompt. ` +
      "Free, from **CloseBoss** (closebossai.com). Wire the placeholders to your own agent + client data and drop each prompt into your AI of choice.",
  );
  lines.push("");
  lines.push("> **Not legal advice.** These are marketing/production templates with compliance guardrails built in — you (and your broker) are responsible for reviewing every output and confirming your state's rules. CloseBoss runs these skills for you, with a Fair Housing + advertising compliance gate on every public-facing output.");
  lines.push("");

  lines.push("## How to use");
  lines.push("");
  lines.push("1. **Prompts are the skill.** Prepend the global preamble, then the skill's prompt.");
  lines.push("2. **Fill the placeholders** from your agent profile + the client/record at hand.");
  lines.push("3. **Compliance is state-parameterized** — the `{{state}}`, `{{license_authority}}`, `{{license_label}}`, `{{avm_disclaimer_rule}}`, and `{{protected_classes}}` placeholders adapt each prompt to your state. Federal Fair Housing classes are universal; your state may add more.");
  lines.push("4. **Chain the validators** — the Fair Housing, advertising, and RESPA checkers run on the output of any content skill before it's client-ready.");
  lines.push("");

  lines.push("### Placeholder legend");
  lines.push("");
  lines.push("`{{agent_name}}` · `{{brokerage}}` · `{{license_label}}` / `{{license_number}}` · `{{market}}` · `{{state}}` · `{{license_authority}}` · `{{language}}` · `{{brand_voice}}` · `{{protected_classes}}` · `{{avm_disclaimer_rule}}` — plus per-skill inputs like `{{address}}`, `{{client_name}}`, `{{mls_data}}`, `{{topic}}`.");
  lines.push("");

  lines.push("### Global preamble (prepend to every skill)");
  lines.push("");
  lines.push("```");
  lines.push(GLOBAL_PREAMBLE);
  lines.push("```");
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const pillar of PILLAR_ORDER) {
    const inPillar = SKILLS.filter((s) => s.pillar === pillar).sort((a, b) => a.num - b.num);
    if (!inPillar.length) continue;
    lines.push(`## ${PILLAR_LABEL[pillar]}`);
    lines.push("");
    for (const s of inPillar) {
      lines.push(`### ${s.num}. ${s.title}`);
      lines.push(`*Assistant: ${ASSIGNEE_LABEL[s.defaultAssignee]}${s.isValidator ? " · compliance validator" : ""}*`);
      lines.push("");
      lines.push(`**Value:** ${s.value}`);
      lines.push("");
      lines.push("**Prompt:**");
      lines.push("");
      lines.push("```");
      lines.push(s.prompt);
      lines.push("```");
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  lines.push("## Want the AI to run these for you?");
  lines.push("");
  lines.push(
    "CloseBoss gives you an AI real estate team that runs this whole library — assigned to a Receptionist, Sales, Marketing, Transaction, and Accounting assistant, with a Boss Assistant that runs the compliance gate on every output. Just ask, and the right assistant does it. Start free at **closebossai.com**.",
  );
  lines.push("");

  return lines.join("\n");
}

export const SKILLS_PACK_FILENAME = "realtor-ai-skills-library.md";
