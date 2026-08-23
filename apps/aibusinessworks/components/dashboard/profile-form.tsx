"use client";

import { useState } from "react";
import { PRODUCTS } from "@/content/products";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/primitives";

export interface ProfileValues {
  headline: string;
  bio: string;
  photoUrl: string;
  location: string;
  industries: string;
  languages: string;
  websiteUrl: string;
  bookingUrl: string;
  contactEmail: string;
  linkedin: string;
  facebook: string;
  instagram: string;
  productKeys: string[];
  isPublic: boolean;
}

export function ProfileForm({
  initial,
  profileUrl,
  canPublish,
}: {
  initial: ProfileValues;
  profileUrl: string;
  canPublish: boolean;
}) {
  const [values, setValues] = useState<ProfileValues>(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const result = (await response.json()) as { ok: boolean; message?: string };
      setMessage(
        response.ok && result.ok
          ? { tone: "ok", text: result.message ?? "Profile saved." }
          : {
              tone: "error",
              text: result.message ?? "We could not save your profile. Please try again.",
            },
      );
    } catch {
      setMessage({
        tone: "error",
        text: "We could not reach the server. Your changes were not saved - please try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="rounded-2xl border border-hairline bg-white p-6 shadow-card">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">
          Public profile
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          This is what businesses see at{" "}
          <span className="font-mono text-[13px] text-navy-700">{profileUrl}</span>. Nothing here
          is published until you switch it on.
        </p>

        <div className="mt-6 space-y-5">
          <Field label="Headline" hint="One line on who you help and how.">
            <Input
              value={values.headline}
              onChange={(v) => set("headline", v)}
              placeholder="Helping real estate professionals adopt AI"
              maxLength={160}
            />
          </Field>

          <Field label="Bio" hint="A short professional biography. Blank lines start a new paragraph.">
            <textarea
              value={values.bio}
              onChange={(e) => set("bio", e.target.value)}
              rows={6}
              maxLength={2000}
              className="w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-navy-400"
            />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Location">
              <Input value={values.location} onChange={(v) => set("location", v)} />
            </Field>
            <Field label="Photo URL" hint="A direct link to a professional headshot.">
              <Input value={values.photoUrl} onChange={(v) => set("photoUrl", v)} placeholder="https://" />
            </Field>
            <Field label="Industries" hint="Comma separated.">
              <Input value={values.industries} onChange={(v) => set("industries", v)} />
            </Field>
            <Field label="Languages" hint="Comma separated.">
              <Input value={values.languages} onChange={(v) => set("languages", v)} />
            </Field>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-white p-6 shadow-card">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">
          Products you recommend
        </h2>
        <div className="mt-5 flex flex-wrap gap-2">
          {PRODUCTS.map((product) => {
            const checked = values.productKeys.includes(product.key);
            return (
              <label
                key={product.key}
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
                    set(
                      "productKeys",
                      e.target.checked
                        ? [...values.productKeys, product.key]
                        : values.productKeys.filter((k) => k !== product.key),
                    )
                  }
                />
                {product.name}
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-white p-6 shadow-card">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">
          How people reach you
        </h2>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field label="Contact email">
            <Input value={values.contactEmail} onChange={(v) => set("contactEmail", v)} type="email" />
          </Field>
          <Field label="Booking link" hint="Powers the Book a demo button.">
            <Input value={values.bookingUrl} onChange={(v) => set("bookingUrl", v)} placeholder="https://" />
          </Field>
          <Field label="Website">
            <Input value={values.websiteUrl} onChange={(v) => set("websiteUrl", v)} placeholder="https://" />
          </Field>
          <Field label="LinkedIn">
            <Input value={values.linkedin} onChange={(v) => set("linkedin", v)} placeholder="https://" />
          </Field>
          <Field label="Facebook">
            <Input value={values.facebook} onChange={(v) => set("facebook", v)} placeholder="https://" />
          </Field>
          <Field label="Instagram">
            <Input value={values.instagram} onChange={(v) => set("instagram", v)} placeholder="https://" />
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-white p-6 shadow-card">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={values.isPublic}
            disabled={!canPublish}
            onChange={(e) => set("isPublic", e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 accent-navy-800"
          />
          <span className="text-sm leading-relaxed text-[#33405a]">
            <strong className="font-semibold text-ink">Publish my profile</strong> to the Partner
            directory. I confirm everything on it is accurate, contains no income claims, and
            follows the Partner Marketing Guidelines.
          </span>
        </label>
        {!canPublish ? (
          <p className="mt-3 text-xs text-amber-700">
            Publishing opens once your Partner account is approved.
          </p>
        ) : null}
      </div>

      {message ? (
        <div
          role="status"
          className={cx(
            "rounded-xl border px-4 py-3 text-sm",
            message.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          {message.text}
        </div>
      ) : null}

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </Button>
        {values.isPublic ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-navy-700 underline underline-offset-4"
          >
            View public page
          </a>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint ? <span className="mt-1.5 block text-xs text-muted">{hint}</span> : null}
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
