import "server-only";

import {
  autoStartBuyingRun,
  getPlaybookAutoSettings,
  hasActiveRun,
  startPlaybookRun,
} from "./service";
import { autoDispatchRunTasks } from "./dispatch";

/**
 * Opt-in auto-start: a new transaction kicks off the matching playbook when the
 * agent has the toggle on (playbook_auto_settings).
 *   listing_rep / dual → house_selling (the listing agreement is signed)
 *   buyer_rep          → house_buying (a buyer is engaged; consultation-first)
 *
 * Best-effort and idempotent — it never throws into the transaction save and
 * won't start a second run for a subject that already has an active one.
 */
export async function maybeAutoStartFromTransaction(args: {
  agentId: string;
  transactionType: "buyer_rep" | "listing_rep" | "dual";
  propertyAddress: string | null;
  contactId: string | null;
}): Promise<void> {
  try {
    const settings = await getPlaybookAutoSettings(args.agentId);
    const isSelling = args.transactionType === "listing_rep" || args.transactionType === "dual";

    if (isSelling) {
      if (!settings.autoSelling || !args.propertyAddress) return;
      if (await hasActiveRun(args.agentId, "house_selling", { address: args.propertyAddress })) return;
      const res = await startPlaybookRun({
        agentId: args.agentId,
        type: "house_selling",
        params: { address: args.propertyAddress, contact_id: args.contactId ?? "" },
      });
      if (res.ok) await autoDispatchRunTasks(args.agentId, res.runId);
      return;
    }

    if (args.transactionType === "buyer_rep") {
      if (!settings.autoBuying || !args.contactId) return;
      if (await hasActiveRun(args.agentId, "house_buying", { contactId: args.contactId })) return;
      await autoStartBuyingRun(args.agentId, args.contactId);
    }
  } catch (e) {
    console.error("[playbook-auto-trigger] failed:", e);
  }
}
