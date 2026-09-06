import "server-only";

import { consumeHubQuota, HUB_QUOTAS } from "../usage";

/** How many assistant messages a browser gets per day. See ../usage.ts. */
export const HUB_CHAT_DAILY_LIMIT = HUB_QUOTAS.chat.limit;

/** Count one message. `allowed` is false once the visitor is over the limit. */
export function consumeHubChatMessage(req: Request): Promise<{ allowed: boolean; used: number }> {
  return consumeHubQuota(req, "chat");
}
