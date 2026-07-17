"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") || "/app";
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setState("error");
      setMsg("Auth isn't configured yet. Set the Supabase env vars.");
      return;
    }
    setState("sending");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setState("error");
      setMsg(error.message);
    } else {
      setState("sent");
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "var(--color-card)",
          border: "1.5px solid var(--color-line)",
          borderRadius: 20,
          padding: 32,
        }}
      >
        <Link
          href="/"
          style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 17, textDecoration: "none" }}
        >
          swipen<span style={{ color: "var(--color-accent)" }}>done</span>
        </Link>
        <h1 style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, margin: "20px 0 6px" }}>
          Sign in
        </h1>
        <p style={{ color: "var(--color-ink-soft)", fontSize: 14, margin: "0 0 20px" }}>
          We&apos;ll email you a magic link — no password needed.
        </p>

        {state === "sent" ? (
          <div
            style={{
              padding: "16px 18px",
              borderRadius: 12,
              background: "var(--color-green-soft)",
              color: "var(--color-green)",
              fontWeight: 600,
            }}
            role="status"
          >
            Check your inbox — we sent a sign-in link to {email}.
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              aria-label="Email address"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 15,
                padding: "14px 16px",
                border: "1.5px solid var(--color-line)",
                borderRadius: 12,
                background: "#fff",
              }}
            />
            <button
              type="submit"
              disabled={state === "sending"}
              style={{
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: 15,
                padding: "14px 22px",
                borderRadius: 12,
                border: "none",
                background: "var(--color-accent)",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {state === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {state === "error" && (
              <p role="status" style={{ color: "var(--color-accent)", fontSize: 13.5, margin: 0 }}>
                {msg}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
