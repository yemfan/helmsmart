import "server-only";

import type { BossTool } from "./types";
import { runCma, generateSellerPresentation, generateDeepReportTool } from "./impl/reports";
import { houseSearch } from "./impl/houseSearch";
import { draftMessage, sendMessage } from "./impl/messaging";
import { scheduleVoiceCall } from "./impl/voice";
import { createCrmTask, createCalendarEvent, queryCrm } from "./impl/crm";
import { publishSocialPost, publishPostEverywhere, scheduleSocialPost, createAvatarVideo } from "./impl/social";
import { importListingFromUrl, createListingVideoAd } from "./impl/listings";
import { importContactsFromFile } from "./impl/contacts";
import { runSkill } from "./impl/skills";
import {
  startSellingPlaybook,
  startBuyingPlaybook,
  setupOpenHouse,
  coordinateClosing,
} from "./impl/playbooks";
import {
  getPipeline,
  getDeals,
  getFinancials,
  getCalendar,
  getSphereSignals,
  getPerformance,
} from "./impl/reads";
import { handOffToAgent } from "./impl/handoff";
import { reportBug } from "./impl/bugs";
import { getMarketSnapshot } from "./impl/market";
import { getAccountSettings } from "./impl/accountSettings";

/**
 * The Boss v2 tool registry (HANDOFF_BOSS_V2 PR-2).
 *
 * Adding a capability = adding one tool module + one entry here. The agent
 * loop (PR-3) reads this catalog; the central executor (./execute.ts) enforces
 * the safety rails regardless of what's registered.
 *
 * NOT registered (deliberately):
 *  - enroll_sequence / pause_sequence — the legacy lead_sequences rail no-ops
 *    on consolidated UUID contact ids (see lib/emailSequences.ts Number()
 *    guard). Wire these once the sequences rail is fixed for UUID contacts.
 */
const ALL_TOOLS = [
  runCma,
  houseSearch,
  generateSellerPresentation,
  generateDeepReportTool,
  draftMessage,
  sendMessage,
  scheduleVoiceCall,
  createCrmTask,
  createCalendarEvent,
  publishSocialPost,
  publishPostEverywhere,
  scheduleSocialPost,
  createAvatarVideo,
  importListingFromUrl,
  createListingVideoAd,
  importContactsFromFile,
  runSkill,
  getAccountSettings,
  startSellingPlaybook,
  startBuyingPlaybook,
  setupOpenHouse,
  coordinateClosing,
  getPipeline,
  getDeals,
  getFinancials,
  getCalendar,
  getSphereSignals,
  getPerformance,
  handOffToAgent,
  reportBug,
  queryCrm,
  getMarketSnapshot,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
] as BossTool<any>[];

const BY_NAME = new Map<string, BossTool<unknown>>(
  ALL_TOOLS.map((t) => [t.name, t as BossTool<unknown>]),
);

export function getBossTool(name: string): BossTool<unknown> | null {
  return BY_NAME.get(name) ?? null;
}

export function listBossTools(): BossTool<unknown>[] {
  return [...ALL_TOOLS] as BossTool<unknown>[];
}
