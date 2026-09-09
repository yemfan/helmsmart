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

/**
 * Supabase writes its own English messages. The handful an owner actually hits
 * get a translated equivalent; anything else passes through untouched, since a
 * message we did not anticipate is still better than a generic one.
 */
async function authErrorMessage(message: string): Promise<string> {
  const t = await getServerT("auth");
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return t("errors.invalidCredentials");
  if (m.includes("email not confirmed")) return t("errors.emailNotConfirmed");
  if (m.includes("already registered")) return t("errors.userAlreadyRegistered");
  if (m.includes("for security purposes") || m.includes("rate limit"))
    return t("errors.rateLimited");
  if (m.includes("password should be at least")) return t("errors.passwordMinLength");
  return message;
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

  if (error) return { error: await authErrorMessage(error.message) };

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
