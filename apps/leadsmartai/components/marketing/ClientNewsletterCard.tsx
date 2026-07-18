"use client";

import { useState } from "react";
import { Copy, Check, Mail } from "lucide-react";

/**
 * "Your Client Newsletter" card (Phase 3) on the Marketing Assistant page.
 *
 * Surfaces the agent's shareable client-signup link (/newsletter/a/[token]) with
 * a Copy button plus their confirmed-subscriber count. Clients who subscribe via
 * this link get the weekly issue sent under the AGENT's brand, automatically.
 */

export default function ClientNewsletterCard({
  shareUrl,
  subscriberCount,
  agentName,
}: {
  shareUrl: string;
  subscriberCount: number;
  agentName: string | null;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked — select-on-focus below still lets them copy manually.
    }
  }

  const you = agentName?.trim() || "you";

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0072ce]/10 text-[#0072ce]">
            <Mail className="h-4 w-4" strokeWidth={2} />
          </span>
          <h2 className="text-sm font-semibold text-gray-900">Your Client Newsletter</h2>
        </div>
        <span className="shrink-0 rounded-full bg-[#0072ce]/10 px-2.5 py-1 text-xs font-semibold text-[#0072ce]">
          {subscriberCount} subscriber{subscriberCount === 1 ? "" : "s"}
        </span>
      </div>

      <p className="mb-4 text-sm text-gray-600">
        Share this link — your clients get a weekly, {you}-branded housing
        briefing, sent for you every week.
      </p>

      <div className="flex items-stretch gap-2">
        <input
          type="text"
          readOnly
          value={shareUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700 outline-none focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20"
        />
        <button
          type="button"
          onClick={copy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#0072ce] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#005ca8]"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" strokeWidth={2.5} /> Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" strokeWidth={2} /> Copy
            </>
          )}
        </button>
      </div>
    </section>
  );
}
