// Phone normalization, match keys, and speech formatting all live in the shared
// @repo/voice package (used by every app that runs the voice agent). Re-exported
// here so existing `@/lib/phone` imports keep working.
export * from "@repo/voice/phone";
