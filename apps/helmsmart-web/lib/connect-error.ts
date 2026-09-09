/**
 * A friendly, ACCURATE message for a failed social connect. Never dumps a raw
 * provider error and never tells the user to "try again" when a retry can't
 * help (e.g. missing config, or a dev-mode app the account isn't approved for).
 *
 * TAKES A TRANSLATOR rather than returning English. This module used to hold
 * the five sentences itself, which meant the Social page — fully translated,
 * every heading and button in the reader's language — answered a failed
 * connection with an English paragraph. Nothing caught it: the i18n guards
 * skip any file that calls no translator, and this file called none, so it
 * was invisible to all of them while looking entirely reasonable in review.
 *
 * The mapping from provider code to message is the part worth testing, so it
 * stays here, pure. `translate` is `getServerT("marketing")` from the page;
 * the copy lives at `social.connectError.*` in that namespace.
 */
export type ConnectErrorTranslate = (
  key: string,
  opts?: { [k: string]: unknown },
) => string;

export function connectErrorMessage(
  provider: string,
  code: string,
  translate: ConnectErrorTranslate,
): string {
  switch (code) {
    case "not_configured":
      return translate("social.connectError.notConfigured", { provider });
    case "bad_state":
    case "missing_context":
      return translate("social.connectError.expired", { provider });
    case "token_exchange_failed":
    case "save_failed":
      return translate("social.connectError.signInFailed", { provider });
    case "access_denied":
      return translate("social.connectError.accessDenied", { provider });
    default:
      // The raw code is shown, spaced out, because it is the one thing support
      // can act on — but it is never the whole message.
      return translate("social.connectError.unknown", {
        provider,
        code: code.replace(/_/g, " "),
      });
  }
}
