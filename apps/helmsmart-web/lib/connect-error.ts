/**
 * A friendly, ACCURATE message for a failed social connect. Never dumps a raw
 * provider error and never tells the user to "try again" when a retry can't
 * help (e.g. missing config, or a dev-mode app the account isn't approved for).
 *
 * Pure + exported so it's unit-tested (see connect-error.test.ts).
 */
export function connectErrorMessage(provider: string, code: string): string {
  const pretty = code.replace(/_/g, " ");
  switch (code) {
    case "not_configured":
      return `${provider} isn't set up on this site yet — its app credentials are missing. This needs an admin to configure; retrying won't help.`;
    case "bad_state":
    case "missing_context":
      return `That ${provider} connection attempt expired before it finished. Please start Connect ${provider} again.`;
    case "token_exchange_failed":
    case "save_failed":
      return `${provider} sign-in didn't complete. Please try connecting again.`;
    case "access_denied":
      return `You cancelled the ${provider} connection, or didn't grant the permissions it needs. Reconnect and approve the requested permissions.`;
    default:
      return `Couldn't connect ${provider} (${pretty}). Try reconnecting — if it keeps failing, the app may still need ${provider} approval or your account must be added as a tester.`;
  }
}
