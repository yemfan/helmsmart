/** In-memory JWT for synchronous reads from `getCloseBossAccessToken` (hydrated from SecureStore on launch). */
let cachedAccessToken = "";

export function setCachedAccessToken(token: string): void {
  cachedAccessToken = token.trim();
}

export function getCachedAccessToken(): string {
  return cachedAccessToken;
}

export function clearCachedAccessToken(): void {
  cachedAccessToken = "";
}
