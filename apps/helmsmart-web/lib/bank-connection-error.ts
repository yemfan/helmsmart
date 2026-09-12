/**
 * What to tell the owner when Plaid has stopped talking to their bank.
 *
 * `lib/plaid-sync.ts` marks a connection `status: 'error'` with Plaid's
 * `error_code` the moment a sync is refused, and `syncBankConnections` then
 * skips that connection on every later run. Until this module existed nothing
 * read either column, so the bank simply stopped updating and the Financial
 * tab went on listing its accounts as though they were current — the worst
 * possible failure for a books product, because the numbers stay on screen and
 * only silently stop being true.
 *
 * TAKES A TRANSLATOR rather than returning English, for the reason
 * `lib/connect-error.ts` documents: a module that holds its own sentences
 * answers a fully translated page in English, and no i18n guard can see it
 * because the file calls no translator. The copy lives at
 * `financial.bank.connectionError.*` in the `settings` namespace.
 *
 * `repair` is the other half, and it is why this is not just a message lookup.
 * Plaid's codes do not all mean "sign in again": a bank that is down needs
 * waiting out, and one Plaid no longer supports will never come back. Offering
 * a Reconnect button in those cases would be the same lie as a success banner
 * over an unchanged row — it invites the owner to spend a minute in a modal
 * that cannot fix anything. Only `reconnect` gets the button.
 */
export type BankErrorTranslate = (
  key: string,
  opts?: { [k: string]: unknown },
) => string;

/**
 * What the owner can actually do about it.
 *
 *   reconnect — signing in again through Plaid Link fixes this
 *   wait      — the bank is down; it recovers on its own, and a retry now
 *               fails the same way
 *   none      — no amount of reconnecting helps; the connection is finished
 */
export type BankConnectionRepair = "reconnect" | "wait" | "none";

export type BankConnectionProblem = {
  message: string;
  repair: BankConnectionRepair;
};

/**
 * Plaid codes that mean "this bank will not be reachable again through this
 * connection". Grouped separately from the transient ones because the ONLY
 * honest next step is to unlink it.
 */
const UNSUPPORTED = new Set([
  "INSTITUTION_NO_LONGER_SUPPORTED",
  "ITEM_NOT_SUPPORTED",
  "PRODUCTS_NOT_SUPPORTED",
]);

/** Codes that clear themselves once the bank is back. */
const INSTITUTION_DOWN = new Set([
  "INSTITUTION_DOWN",
  "INSTITUTION_NOT_RESPONDING",
  "INSTITUTION_NOT_AVAILABLE",
]);

/** The bank changed what it will accept — new password, new MFA, new username. */
const CREDENTIALS_CHANGED = new Set([
  "INVALID_CREDENTIALS",
  "INVALID_MFA",
  "INVALID_UPDATED_USERNAME",
  "INSUFFICIENT_CREDENTIALS",
]);

/** Plaid is warning the login is about to lapse — it still works for now. */
const EXPIRING = new Set(["PENDING_EXPIRATION", "PENDING_DISCONNECT"]);

export function bankConnectionProblem(
  errorCode: string | null | undefined,
  institution: string,
  translate: BankErrorTranslate,
): BankConnectionProblem {
  const code = errorCode ?? "UNKNOWN";

  if (code === "ITEM_LOGIN_REQUIRED") {
    return { message: translate("financial.bank.connectionError.loginRequired", { institution }), repair: "reconnect" };
  }
  if (code === "USER_PERMISSION_REVOKED" || code === "USER_ACCOUNT_REVOKED") {
    return { message: translate("financial.bank.connectionError.permissionRevoked", { institution }), repair: "reconnect" };
  }
  if (EXPIRING.has(code)) {
    return { message: translate("financial.bank.connectionError.expiring", { institution }), repair: "reconnect" };
  }
  if (CREDENTIALS_CHANGED.has(code)) {
    return { message: translate("financial.bank.connectionError.credentialsChanged", { institution }), repair: "reconnect" };
  }
  // Unlocking happens at the bank, but the sign-in still has to be redone here
  // afterwards — so the button stays, and the copy says which comes first.
  if (code === "ITEM_LOCKED") {
    return { message: translate("financial.bank.connectionError.locked", { institution }), repair: "reconnect" };
  }
  if (INSTITUTION_DOWN.has(code)) {
    return { message: translate("financial.bank.connectionError.institutionDown", { institution }), repair: "wait" };
  }
  if (UNSUPPORTED.has(code)) {
    return { message: translate("financial.bank.connectionError.notSupported", { institution }), repair: "none" };
  }

  // An unrecognised code is still worth reconnecting over — it is the one
  // repair we have — but the code is shown, spaced out so it reads as words,
  // because it is the only thing support can act on.
  return {
    message: translate("financial.bank.connectionError.unknown", {
      institution,
      code: code.replace(/_/g, " "),
    }),
    repair: "reconnect",
  };
}
