"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";

export type AuthState = { error: string } | null;

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

  if (error) return { error: error.message };

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

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await requestOrigin()}/api/auth/callback`,
    },
  });

  if (error) return { error: error.message };

  // Email confirmation required (Supabase default)
  if (data.user && !data.session) {
    return {
      error:
        "Check your email for a confirmation link, then sign in to continue.",
    };
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
  const email = formData.get("email") as string;
  if (!email) return { error: "Please enter your email address." };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await requestOrigin()}/api/auth/callback?next=/reset-password`,
  });

  if (error) return { error: error.message };

  return { error: "Check your email — we sent a password reset link." };
}

// ── Password reset (step 2 — set new password) ───────────────────────────────

export async function updatePassword(
  _: AuthState,
  formData: FormData
): Promise<AuthState> {
  const password = formData.get("password") as string;
  const confirm  = formData.get("confirm")  as string;

  if (!password || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };

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

  if (!password || password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirm) return { error: "Passwords do not match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  return { ok: true };
}
