/**
 * Which app build a mobile request came from.
 *
 * The app sends `X-App-Version` (its Expo `version`) on every authenticated
 * call. Server-side changes that grow a payload can then keep the old shape
 * for builds that cannot render the new one, instead of choosing between
 * breaking installed apps and never shipping.
 *
 * A build that predates the header, or a value that is not a dotted number,
 * reads as "unknown" — and unknown is treated as old, never as new.
 */
export function mobileAppVersion(req: Request): string | null {
  const raw = req.headers.get("x-app-version")?.trim() ?? "";
  return /^\d+(\.\d+){0,2}$/.test(raw) ? raw : null;
}

/** `version >= min`, comparing major.minor.patch numerically. Unknown is below everything. */
export function versionAtLeast(version: string | null, min: string): boolean {
  if (!version) return false;
  const have = version.split(".").map(Number);
  const need = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const a = have[i] ?? 0;
    const b = need[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}
