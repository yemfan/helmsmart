"use client";

import { useState } from "react";
import type { RegionOption } from "@/lib/newsletter/regions";

/**
 * Newsletter subscribe capture (Phase 1). Email + region picker → POST to
 * /api/newsletter/subscribe, which inserts into newsletter_subscriptions via the
 * service-role client. NO EMAIL IS SENT in Phase 1 — this only builds the list;
 * the success state says the first issue is coming soon.
 */

type Status = "idle" | "submitting" | "done" | "error";

export default function SubscribeForm({
  regions,
  defaultSlug = "national",
  agentToken,
  agentName,
}: {
  regions: RegionOption[];
  defaultSlug?: string;
  /** Phase 3: when set, subscribers are attributed to this agent (agent_id). */
  agentToken?: string;
  /** Agent display name for the agent-branded success copy. */
  agentName?: string;
}) {
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState(defaultSlug);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  const groupedStates = regions.filter((r) => r.level === "state");
  const groupedMetros = regions.filter((r) => r.level === "metro");
  const national = regions.find((r) => r.level === "national");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage("");

    const region = regions.find((r) => r.slug === slug) ?? national;
    if (!region) {
      setStatus("error");
      setMessage("Please choose a region.");
      return;
    }

    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          regionLevel: region.level,
          regionCode: region.code,
          regionName: region.name,
          ...(agentToken ? { agentToken } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (res.ok && data.ok) {
        if (data.message) setMessage(data.message);
        setStatus("done");
      } else {
        setStatus("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <div className="rounded-2xl border border-[#0072ce]/30 bg-[#0072ce]/5 p-6 text-center">
        <p className="text-lg font-semibold text-slate-900">
          {message || "Check your email to confirm your subscription."}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {agentName
            ? `Once you confirm, ${agentName} will send you a weekly rates + housing briefing for the region you picked.`
            : "We'll send your weekly rates + housing briefing for the region you picked. In the meantime, browse the latest issues below."}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm ring-1 ring-slate-900/[0.03]"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr,auto]">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Region
            </span>
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20"
            >
              {national && <option value={national.slug}>{national.name}</option>}
              {groupedStates.length > 0 && (
                <optgroup label="States">
                  {groupedStates.map((r) => (
                    <option key={`state-${r.code}`} value={r.slug}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {groupedMetros.length > 0 && (
                <optgroup label="Top metros">
                  {groupedMetros.map((r) => (
                    <option key={`metro-${r.code}`} value={r.slug}>
                      {r.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-lg bg-[#0072ce] px-5 py-2 text-sm font-semibold text-white transition hover:bg-[#005ca8] disabled:opacity-60 sm:w-auto"
          >
            {status === "submitting" ? "Subscribing…" : "Subscribe"}
          </button>
        </div>
      </div>
      {status === "error" && message && (
        <p className="mt-3 text-sm text-red-600">{message}</p>
      )}
      <p className="mt-3 text-xs text-slate-400">
        Free weekly briefing. No spam — unsubscribe anytime.
      </p>
    </form>
  );
}
