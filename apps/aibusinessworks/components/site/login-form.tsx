"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setError(
        "Partner login is not available on this deployment yet - it is not connected to a database.",
      );
      setSubmitting(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        // Deliberately does not distinguish "no such account" from "wrong
        // password" - that difference leaks who has an account.
        setError("That email and password did not match. Please check both and try again.");
        return;
      }

      router.push(next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } catch {
      setError("We could not reach the sign-in service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-hairline bg-white p-7 shadow-card sm:p-8"
      noValidate
    >
      <label className="block">
        <span className="text-sm font-medium text-ink">Email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="mt-1.5 w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-navy-400"
        />
      </label>

      <label className="mt-5 block">
        <span className="text-sm font-medium text-ink">Password</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          className="mt-1.5 w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-navy-400"
        />
      </label>

      {error ? (
        <div
          role="alert"
          className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error}
        </div>
      ) : null}

      <div className="mt-7">
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? "Signing in..." : "Log in"}
        </Button>
      </div>

      <p className="mt-6 text-center text-sm text-muted">
        Not a Partner yet?{" "}
        <Link href="/join" className="font-medium text-navy-700 underline underline-offset-4">
          Register
        </Link>
      </p>
    </form>
  );
}
