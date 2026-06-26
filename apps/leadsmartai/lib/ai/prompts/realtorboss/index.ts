/**
 * RealtyBoss prompt library — re-exported from the real-estate
 * industry pack (`@helm/pack-real-estate`), where the AI team's
 * personas, skills, and guardrails are defined as pack config
 * (HelmSmart tenet: packs = config, core stays industry-agnostic).
 */
export {
  SHARED_GUARDRAILS,
  VOICE_GUARDRAILS,
  withGuardrails,
  BOSS_ASSISTANT_SYSTEM_PROMPT,
  RECEPTIONIST_SYSTEM_PROMPT,
  SALES_ASSISTANT_SYSTEM_PROMPT,
  MARKETING_ASSISTANT_SYSTEM_PROMPT,
  TRANSACTION_ASSISTANT_SYSTEM_PROMPT,
  ACCOUNTANT_SYSTEM_PROMPT,
  bossBriefingPrompt,
  type BossBriefingSignals,
  SKILLS,
  getSkill,
  skillPrompts,
  buildVoicePlaybook,
  type Skill,
  type SkillCategory,
} from "@helm/pack-real-estate";
