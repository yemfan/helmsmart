"use server";

import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type WaitlistResult = { ok: boolean; message: string };

/** Insert a waitlist signup. Idempotent on email (unique constraint → treated as success). */
export async function joinWaitlist(email: string): Promise<WaitlistResult> {
  const clean = email.trim().toLowerCase();
  if (!EMAIL_RE.test(clean)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const admin = createAdminClient();
  if (!admin) {
    // Env not configured (e.g. local preview without secrets) — stay demo-safe.
    return { ok: true, message: "You're on the list. We'll be in touch soon. ✓" };
  }

  const { error } = await admin.from("waitlist").insert({ email: clean });
  // 23505 = unique_violation → already signed up, still a success from the user's view.
  if (error && error.code !== "23505") {
    return { ok: false, message: "Something went wrong — try again in a moment." };
  }
  return { ok: true, message: "You're on the list. We'll be in touch soon. ✓" };
}
