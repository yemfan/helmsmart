/**
 * Extra parameters the provider needs on a "Continue with…" click.
 *
 * Google signs the person straight back in as whoever its browser session
 * already holds, with no way to pick another account — a real problem for
 * anyone with a personal and a work Google account, or a shared computer.
 * `prompt=select_account` makes Google show the account chooser every time;
 * it costs one click for a single-account user and is the only way a second
 * account can get in.
 *
 * Apple has no equivalent parameter (it always shows its own sheet), so it
 * gets nothing.
 */
export function oauthQueryParams(provider: "google" | "apple"): Record<string, string> | undefined {
  return provider === "google" ? { prompt: "select_account" } : undefined;
}
