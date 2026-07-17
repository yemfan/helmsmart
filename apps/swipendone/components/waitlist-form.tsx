"use client";

import { useState } from "react";
import { joinWaitlist } from "@/lib/actions/waitlist";
import styles from "@/app/landing.module.css";

export function WaitlistForm({ cta }: { cta: string }) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    setPending(true);
    const res = await joinWaitlist(email);
    setPending(false);
    setMsg({ text: res.message, ok: res.ok });
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
