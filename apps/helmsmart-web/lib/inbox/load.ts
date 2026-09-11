/**
 * The server half of the inbox: who each conversation can still be reached on.
 *
 * One read of the organization's opt-outs (`loadOrgOptOuts`, from #1748's
 * consent module) decides every thread on the page, with the same
 * `decideConsent` the send path uses — so the header's "Opted out of texts
 * since Sep 3" and the refusal a send would get cannot disagree.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { inputsFor, loadOrgOptOuts, optOutState } from "@/lib/consent";
import type { InboxThread } from "@/lib/inbox/threads";

export async function withConsent(db: SupabaseClient, orgId: string, threads: InboxThread[]): Promise<InboxThread[]> {
  if (!threads.length) return threads;
  let optOuts: Awaited<ReturnType<typeof loadOrgOptOuts>>;
  try {
    optOuts = await loadOrgOptOuts(db, orgId);
  } catch (e) {
    // Show no opt-out state rather than a guessed one. A send still fails
    // closed in lib/outbound-send.ts and says why.
    console.error("[inbox] opt-out lookup failed:", e);
    return threads;
  }
  return threads.map((thread) => {
    const state = optOutState(
      inputsFor(optOuts, { clientId: thread.clientId, phone: thread.clientPhone, email: thread.clientEmail }),
    );
    return { ...thread, consent: { sms: state.sms, email: state.email } };
  });
}
