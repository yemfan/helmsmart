"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { submitContactForm, type ContactState } from "@/lib/actions/contact";

const field =
  // placeholder is navy-400, not 300: 300 only manages 2.46:1 on white.
  "w-full rounded-xl border bg-white px-4 py-3 text-navy-900 outline-none transition-colors placeholder:text-navy-400 focus:border-navy-500 focus:ring-2 focus:ring-navy-500/20";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-block rounded-full bg-navy-800 px-6 py-3.5 font-bold text-white transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send message"}
    </button>
  );
}

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-1.5 block text-sm font-bold text-navy-800">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="mt-1.5 text-sm font-semibold text-brand-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ContactForm({ email }: { email: string }) {
  const [state, formAction] = useActionState<ContactState, FormData>(submitContactForm, {});

  if (state.success) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-line bg-mist p-8 text-center"
      >
        <h2 className="font-serif text-2xl font-bold text-navy-800">Thank you — message sent.</h2>
        <p className="mt-2 text-navy-500">
          We&rsquo;ve received your enquiry and will get back to you shortly.
        </p>
      </div>
    );
  }

  const fe = state.fieldErrors ?? {};
  const invalid = (n: string) => (fe[n] ? "border-brand-400" : "border-line");
  const a11y = (n: string) =>
    fe[n] ? ({ "aria-invalid": true, "aria-describedby": `${n}-error` } as const) : {};

  return (
    <form action={formAction} className="space-y-5">
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 font-semibold text-brand-700"
        >
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" name="name" error={fe.name}>
          <input
            id="name"
            name="name"
            required
            maxLength={100}
            autoComplete="name"
            placeholder="Jane Doe"
            className={`${field} ${invalid("name")}`}
            {...a11y("name")}
          />
        </Field>
        <Field label="Email" name="email" error={fe.email}>
          <input
            id="email"
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            placeholder="jane@company.com"
            className={`${field} ${invalid("email")}`}
            {...a11y("email")}
          />
        </Field>
      </div>

      <Field label="Subject" name="subject" error={fe.subject}>
        <input
          id="subject"
          name="subject"
          maxLength={150}
          placeholder="How can we help?"
          className={`${field} ${invalid("subject")}`}
          {...a11y("subject")}
        />
      </Field>

      <Field label="Message" name="message" error={fe.message}>
        <textarea
          id="message"
          name="message"
          required
          rows={7}
          maxLength={5000}
          placeholder="Tell us a little about what you have in mind."
          className={`${field} ${invalid("message")} resize-y`}
          {...a11y("message")}
        />
      </Field>

      {/* Honeypot — hidden from people, tempting to bots. */}
      <div aria-hidden className="absolute left-[-9999px] top-[-9999px]">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-wrap items-center gap-4 pt-1">
        <SubmitButton />
        <p className="text-sm text-navy-500">
          Or email us at{" "}
          <a href={`mailto:${email}`} className="font-semibold text-navy-800 underline">
            {email}
          </a>
        </p>
      </div>

      {/* Accurate to what the code does: the action emails the team and stores nothing. */}
      <p className="text-sm text-navy-400">
        We use your details only to respond to your enquiry. Your message is emailed to our team
        and isn&rsquo;t stored on this website.
      </p>
    </form>
  );
}
