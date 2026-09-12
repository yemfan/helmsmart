/**
 * One verdict about a number, used by every screen that claims readiness.
 *
 * `verifyNumberWiring()` answers three independent questions — does the number
 * exist at the provider, does its inbound webhook point at us, is our agent
 * bound to it — and before this module each screen turned that into its own
 * sentence. The receptionist checklist said "Ready", the Voice AI card said
 * "Connected", and the /voice header said nothing at all, over the exact same
 * unwired number. Three readings of one fact is two readings too many.
 *
 * So the mapping lives here, as a pure function over the result, and the
 * screens render what it returns. It is also the only part of this that a unit
 * test can reach: vitest collects `lib/**` only, so a verdict built in a
 * component is a verdict nothing checks.
 */

/** Exactly the shape `verifyNumberWiring()` resolves to. */
export type WiringResult = {
  ok: boolean;
  numberFound: boolean;
  webhookOk: boolean;
  agentOk: boolean;
  error?: string;
};

export type WiringVerdict = {
  /**
   * - `wired` — a caller gets answered.
   * - `unwired` — the provider disagrees with us in a way we can name.
   * - `unknown` — we could not ask (no API key, provider down). NOT a pass.
   */
  state: "wired" | "unwired" | "unknown";
  /** i18n key for the headline sentence. */
  headlineKey: string;
  /** i18n keys naming each failing check, in the order they should be read. */
  reasonKeys: string[];
  /** Provider error text, when there is one. Not a translation key. */
  errorText?: string;
  /**
   * True when the number exists at the provider but is bound wrong — the one
   * case we can repair ourselves, with `rebindNumber()`. A number the provider
   * has never heard of is not ours to fix; that org gets the manual URLs.
   */
  canRebind: boolean;
};

/**
 * Turn a verification result into the one thing every screen should say.
 *
 * `null` means "not checked yet" and is deliberately NOT a pass — it maps to
 * `unknown`, so a screen that renders a verdict before the check returns says
 * "not checked", never "Ready".
 */
export function describeWiring(result: WiringResult | null): WiringVerdict {
  if (!result) {
    return { state: "unknown", headlineKey: "wiring.notChecked", reasonKeys: [], canRebind: false };
  }

  // A provider error is not evidence about the number. Saying "this number
  // isn't at the provider" because our API key is missing would send the owner
  // to fix the wrong thing.
  if (result.error) {
    return {
      state: "unknown",
      headlineKey: "wiring.couldNotCheck",
      reasonKeys: [],
      errorText: result.error,
      canRebind: false,
    };
  }

  if (result.ok) {
    return { state: "wired", headlineKey: "wiring.wired", reasonKeys: [], canRebind: false };
  }

  if (!result.numberFound) {
    return {
      state: "unwired",
      headlineKey: "wiring.notConnected",
      reasonKeys: ["wiring.reason.notInProvider"],
      canRebind: false,
    };
  }

  const reasonKeys: string[] = [];
  if (!result.agentOk) reasonKeys.push("wiring.reason.agentNotBound");
  if (!result.webhookOk) reasonKeys.push("wiring.reason.webhookElsewhere");

  return {
    state: "unwired",
    headlineKey: "wiring.notConnected",
    // `ok` false with both sub-checks true should not happen; if the provider
    // ever produces it, say the number is misconfigured rather than nothing.
    reasonKeys: reasonKeys.length > 0 ? reasonKeys : ["wiring.reason.misconfigured"],
    canRebind: true,
  };
}

/**
 * Does this org get to say its receptionist is ready?
 *
 * The app-side checklist (number recorded, hours, appointment types, agent
 * switched on) is necessary and nowhere near sufficient — the number also has
 * to answer. Both halves, or it is not ready.
 */
export function isReceptionistReady(appReady: boolean, result: WiringResult | null): boolean {
  return appReady && describeWiring(result).state === "wired";
}
