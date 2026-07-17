"use client";

import { useState } from "react";
import { joinWaitlist } from "@/lib/actions/waitlist";
import styles from "@/app/landing.module.css";

export interface WaitlistMessages {
  success: string;
  invalid: string;
  error: string;
}

export function WaitlistForm({ cta, messages }: { cta: string; messages: WaitlistMessages }) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setMsg({ text: messages.invalid, ok: false });
      return;
    }
    setPending(true);
    const res = await joinWaitlist(email);
    setPending(false);
    // Localize based on outcome (the server action's own text is English).
    setMsg({ text: res.ok ? messages.success : messages.error, ok: res.ok });
    if (res.ok) form.reset();
  }

  return (
    <>
      <form className={styles.heroForm} onSubmit={onSubmit} noValidate>
        <input
          type="email"
          name="email"
          placeholder="you@company.com"
          required
          aria-label="Email address"
        />
        <button className={styles.btnAcc} type="submit" disabled={pending}>
          {pending ? "…" : cta}
        </button>
      </form>
      {msg && (
        <p
          className={styles.formMsg}
          role="status"
          style={{ color: msg.ok ? "var(--green)" : "var(--accent)" }}
        >
          {msg.text}
        </p>
      )}
    </>
  );
}
