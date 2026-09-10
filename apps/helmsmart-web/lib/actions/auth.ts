"use server";

import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

/**
 * `error` carries whatever the form should show below the control — including
 * the two one-shot flows whose outcome is a durable instruction rather than a
 * failure ("check your email"). `sent` is what tells the two apart: the page
 * used to sniff the message for "check your email", which stops working the
 * moment the message is Chinese.
 */
export type AuthState = { error: string; sent?: boolean } | null;

/** Rate limiting is a fact about the CALLER, never about the address they typed,
 *  so it is the one Supabase failure that is always safe to report verbatim. */
function isRateLimit(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("for security purposes") || m.includes("rate limit");
}

/**
 * Supabase writes its own English messages. The handful an owner actually hits
 * get a translated equivalent; anything else becomes a generic one.
 *
 * This used to `return message` for the unrecognised tail, on the reasoning that
 * a specific English message beats a vague translated one. Two things were wrong
 * with that. It fails OPEN into English — a zh-Hans reader who mistypes an email
 * gets `Email address "…" is invalid` in a red box under a Chinese form, which is
 * the one thing the whole i18n effort exists to prevent. And, worse, it forwards
 * whatever Supabase chose to say, which is not ours to publish: see
 * `requestPasswordReset` below, where passing the raw message through turned an
 * upstream account-enumeration leak into a visible one.
 *
 * The detail is not lost, it just stops being the user's problem — the raw text
 * goes to the server log, where the person who can act on it will look.
 */
async function authErrorMessage(message: string): Promise<string> {
  const t = await getServerT("auth");
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return t("errors.invalidCredentials");
  if (m.includes("email not confirmed")) return t("errors.emailNotConfirmed");
  if (m.includes("already registered")) return t("errors.userAlreadyRegistered");
  if (isRateLimit(m)) return t("errors.rateLimited");
  if (m.includes("password should be at least")) return t("errors.passwordMinLength");

  console.error("[auth] unmapped Supabase error:", message);
  return t("errors.unexpected");
}

/**
 * Origin of the CURRENT request (the vertical's own host), e.g.
 * https://medical.helmsmart.ai — so per-vertical confirmation / password-reset
 * emails link back to the host the user actually signed up on, not a static base
 * URL. Falls back to NEXT_PUBLIC_APP_URL if the host header is somehow absent.
 */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("host");
  if (!host) return process.env.NEXT_PUBLIC_APP_URL ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// ── Sign in ──────────────────────────────────────────────────────────────────

export async function signIn(
  _: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: await authErrorMessage(error.message) };

  const next = formData.get("next") as string | null;
  redirect(next?.startsWith("/") ? next : "/home");
}

// ── Sign up ──────────────────────────────────────────────────────────────────

export async function signUp(
  _: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const t = await getServerT("auth");

  if (password.length < 8) {
    return { error: t("errors.passwordMinLength") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await requestOrigin()}/api/auth/callback`,
    },
  });

  if (error) return { error: await authErrorMessage(error.message) };

  // Email confirmation required (Supabase default)
  if (data.user && !data.session) {
    return { error: t("errors.checkEmailConfirm"), sent: true };
  }

  redirect("/onboarding");
}

// ── Sign out ─────────────────────────────────────────────────────────────────

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();

  // Clear the org-scoping cookies too. Without this, a stale helmsmart-org-id
  // (or legacy smbai-org-id) survives the sign-out and poisons the NEXT account
  // that logs in on this browser: middleware sees a cookie and waves them into
  // an org they don't belong to, and the onboarding gate is skipped — so a fresh
  // signup lands in an empty, unusable dashboard and can never create its org.
  const cookieStore = await cookies();
  cookieStore.delete("helmsmart-org-id");
  cookieStore.delete("smbai-org-id");

  redirect("/login");
}

// ── Password reset (step 1 — send email) ─────────────────────────────────────

/**
 * Ask Supabase to mail a reset link, and answer the SAME WAY whatever happens.
 *
 * `resetPasswordForEmail` deliberately returns success for an address with no
 * account, so that this screen cannot be used to find out who has one. Supabase
 * does not always hold that line — it answers 400 `email_address_invalid` for an
 * address on a reserved or blocked domain, and that check only runs once a user
 * exists (supabase/auth#2702). Reporting the error therefore told an attacker
 * exactly what Supabase was trying not to say: red box means the account is
 * real, "check your email" means it is not. One submission per guess.
 *
 * So only the rate-limit case is reported — it depends on the caller, not on the
 * address, and swallowing it would leave someone staring at "check your email"
 * for a mail that was never sent. Everything else is logged and answered
 * identically, which is what the endpoint was always supposed to do.
 *
 * Note this makes an undeliverable address indistinguishable from a delivered
 * one, on purpose. That is the trade the non-disclosure requires, and it is why
 * the log line matters: it is the only place the real reason survives.
 */
export async function requestPasswordReset(
  _: AuthState,
  formData: FormData
): Promise<AuthState> {
  const t = await getServerT("auth");
  const email = formData.get("email") as string;
  if (!email) return { error: t("errors.emailRequired") };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}/api/auth/callback?next=/reset-password`,
  });

  if (error && isRateLimit(error.message)) {
    return { error: t("errors.rateLimited") };
  }

  if (error) {
    console.error("[auth] password reset refused:", error.message);
  }

  return { error: t("errors.checkEmailReset"), sent: true };
}

// ── Password reset (step 2 — set new password) ───────────────────────────────

export async function updatePassword(
  _: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = formData.get("password") as string;
  const confirm  = formData.get("confirm")  as string;

  const t = await getServerT("auth");

  if (!password || password.length < 8) {
    return { error: t("errors.passwordMinLength") };
  }
  if (password !== confirm) {
    return { error: t("errors.passwordsDoNotMatch") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: await authErrorMessage(error.message) };

  redirect("/home");
}

// ── Change password (in-app, while signed in) ────────────────────────────────

/**
 * Update the signed-in user's password from the account menu. Unlike updatePassword
 * (used in the reset flow), this stays on the page and reports success so a modal can
 * close itself. Return type is inferred by the caller's useActionState — no exported
 * type, since a "use server" module may only export async functions.
 */
export async function changePassword(
  _: { error: string } | { ok: true } | null,
  formData: FormData
): Promise<{ error: string } | { ok: true } | null> {
  const password = formData.get("password") as string;
  const confirm  = formData.get("confirm")  as string;

  const t = await getServerT("auth");

  if (!password || password.length < 8) return { error: t("errors.passwordMinLength") };
  if (password !== confirm) return { error: t("errors.passwordsDoNotMatch") };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: await authErrorMessage(error.message) };

  return { ok: true };
}
