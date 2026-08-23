"use client";

import Link from "next/link";
import { useState } from "react";
import { PRODUCTS } from "@/content/products";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/primitives";

const PRODUCT_OPTIONS = [
  ...PRODUCTS.map((p) => ({ value: p.key, label: p.name })),
  { value: "all", label: "All products" },
];

const HEARD_OPTIONS = [
  "An AI Business Works Partner",
  "Search",
  "Social media",
  "An event or presentation",
  "A colleague or friend",
  "Something else",
];

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string;
  country: string;
  stateProvince: string;
  businessName: string;
  industry: string;
  website: string;
  primaryMarket: string;
  heardAbout: string;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  password: "",
  phone: "",
  country: "",
  stateProvince: "",
  businessName: "",
  industry: "",
  website: "",
  primaryMarket: "",
  heardAbout: "",
};

export function JoinForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [interests, setInterests] = useState<string[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{ message: string; field?: string } | null>(null);
  const [done, setDone] = useState<{ partnerCode: string } | null>(null);

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, productInterests: interests, acceptedTerms: accepted }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        message?: string;
        field?: string;
        partnerCode?: string;
      };

      if (!response.ok || !result.ok) {
        setError({
          message:
            result.message ??
            "Something went wrong on our side. Please try again in a moment.",
          field: result.field,
        });
        return;
      }
      setDone({ partnerCode: result.partnerCode ?? "" });
    } catch {
      setError({
        message:
          "We could not reach the server. Check your connection and try again - nothing was submitted.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-8 shadow-card sm:p-10">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-lg font-bold text-emerald-700">
          &#10003;
        </div>
        <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight text-ink">
          Application received
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Your Partner account has been created and is pending review. Your Partner code is{" "}
          <strong className="font-semibold text-ink">{done.partnerCode}</strong>.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Once your account is approved, your referral link, discount code, QR code and the Academy
          open in your dashboard. You can log in now to see your application status.
        </p>
        <div className="mt-7">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-hairline bg-white p-6 shadow-card sm:p-8"
      noValidate
    >
      <Fieldset legend="About you">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" required error={error?.field === "firstName" ? error.message : undefined}>
            <Input value={form.firstName} onChange={set("firstName")} autoComplete="given-name" required />
          </Field>
          <Field label="Last name" required error={error?.field === "lastName" ? error.message : undefined}>
            <Input value={form.lastName} onChange={set("lastName")} autoComplete="family-name" required />
          </Field>
          <Field label="Email" required error={error?.field === "email" ? error.message : undefined}>
            <Input type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
          </Field>
          <Field label="Phone">
            <Input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
          </Field>
          <Field
            label="Password"
            required
            hint="At least 10 characters."
            error={error?.field === "password" ? error.message : undefined}
          >
            <Input
              type="password"
              value={form.password}
              onChange={set("password")}
              autoComplete="new-password"
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Country">
              <Input value={form.country} onChange={set("country")} autoComplete="country-name" />
            </Field>
            <Field label="State / Province">
              <Input value={form.stateProvince} onChange={set("stateProvince")} />
            </Field>
          </div>
        </div>
      </Fieldset>

      <Fieldset legend="Your business">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <Input value={form.businessName} onChange={set("businessName")} autoComplete="organization" />
          </Field>
          <Field label="Industry">
            <Input value={form.industry} onChange={set("industry")} />
          </Field>
          <Field label="Website">
            <Input value={form.website} onChange={set("website")} inputMode="url" placeholder="https://" />
          </Field>
          <Field label="Primary market" hint="The businesses you already talk to.">
            <Input value={form.primaryMarket} onChange={set("primaryMarket")} />
          </Field>
        </div>
      </Fieldset>

      <Fieldset legend="Product interests">
        <div className="flex flex-wrap gap-2">
          {PRODUCT_OPTIONS.map((option) => {
            const checked = interests.includes(option.value);
            return (
              <label
                key={option.value}
                className={cx(
                  "cursor-pointer rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                  checked
                    ? "border-navy-900 bg-navy-900 text-white"
                    : "border-hairline bg-white text-navy-700 hover:border-navy-300",
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  onChange={(e) =>
                    setInterests((prev) =>
                      e.target.checked
                        ? [...prev, option.value]
                        : prev.filter((v) => v !== option.value),
                    )
                  }
                />
                {option.label}
              </label>
            );
          })}
        </div>

        <div className="mt-5">
          <Field label="How did you hear about us?">
            <select
              value={form.heardAbout}
              onChange={(e) => set("heardAbout")(e.target.value)}
              className="w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-navy-400"
            >
              <option value="">Select an option</option>
              {HEARD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Fieldset>

      <div className="mt-8 border-t border-hairline pt-6">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-navy-800"
          />
          <span className="text-sm leading-relaxed text-[#33405a]">
            I agree to the{" "}
            <Link href="/terms" className="font-medium underline underline-offset-4">
              Partner Program Terms
            </Link>
            , the{" "}
            <Link href="/privacy" className="font-medium underline underline-offset-4">
              Privacy Policy
            </Link>{" "}
            and the{" "}
            <Link href="/marketing-guidelines" className="font-medium underline underline-offset-4">
              Partner Marketing Guidelines
            </Link>
            , and I understand that no income is promised or guaranteed.
          </span>
        </label>
        {error?.field === "acceptedTerms" ? (
          <p className="mt-2 text-sm text-rose-700">{error.message}</p>
        ) : null}
      </div>

      {error && !error.field ? (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
        >
          {error.message}
        </div>
      ) : null}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Submitting..." : "Become a Partner"}
        </Button>
        <p className="text-xs text-muted">
          Free to join. No inventory, no purchase requirement, no monthly minimum.
        </p>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-8 first:mt-0">
      <legend className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-navy-500">
        {legend}
      </legend>
      <div className="mt-5">{children}</div>
    </fieldset>
  );
}

function Field({
  label,
  children,
  required,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="ml-1 text-rose-600">*</span> : null}
      </span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span className="mt-1.5 block text-sm text-rose-700">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

function Input({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  return (
    <input
      {...props}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors placeholder:text-navy-300 focus:border-navy-400"
    />
  );
}
