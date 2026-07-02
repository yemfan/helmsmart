/**
 * RealtyBoss — the real-estate AI team definition (roster, skills,
 * personas, guardrails). Lives in the pack so the team is config the
 * core consumes, not app code (build once, configure many).
 */
export { SHARED_GUARDRAILS, VOICE_GUARDRAILS, withGuardrails } from "./guardrails";
export {
  BOSS_ASSISTANT_SYSTEM_PROMPT,
  RECEPTIONIST_SYSTEM_PROMPT,
  SALES_ASSISTANT_SYSTEM_PROMPT,
  MARKETING_ASSISTANT_SYSTEM_PROMPT,
  TRANSACTION_ASSISTANT_SYSTEM_PROMPT,
  ACCOUNTANT_SYSTEM_PROMPT,
  bossBriefingPrompt,
  type BossBriefingSignals,
} from "./prompts";
export {
  SKILLS,
  getSkill,
  skillPrompts,
  buildVoicePlaybook,
  RECEPTIONIST_MESSAGE_PLAYBOOK,
  type Skill,
  type SkillCategory,
} from "./skills";
export { AI_TEAM, getAssistant, type AssistantDef, type AssistantType } from "./team";
