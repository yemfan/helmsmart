"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * The address to forward a mailbox to, shown at the foot of the thread list.
 *
 * It used to live on Settings under "Integrations & webhooks", between a Stripe
 * webhook URL and a note about CRON_SECRET — operator configuration a business
 * owner can neither use nor change. This is the one item on that panel that was
 * genuinely theirs, and it belongs where the mail arrives: someone wondering
 * why their inbox is empty is looking at the inbox, not at settings.
 *
 * Rendered only when `inboundAddressFor` returns an address, so a misconfigured
 * INBOUND_EMAIL_DOMAIN shows nothing rather than something uncopyable.
 */
export function InboxForwardingAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused (insecure origin, permissions). The
      // address is on screen and selectable, so there is nothing to recover
      // from — just don't claim it was copied.
    }
  }

  return (
    <div className="px-4 py-3 border-t border-slate-100">
      <p className="text-[11px] text-slate-400 mb-1">Forward your email here</p>
      <div className="flex items-center gap-1.5">
        <code
          className="flex-1 min-w-0 truncate text-[11px] font-mono text-slate-600"
          title={address}
        >
          {address}
        </code>
        <button
          onClick={copy}
          className="p-1 rounded hover:bg-slate-100 transition-colors flex-shrink-0"
          aria-label={copied ? "Address copied" : "Copy address"}
          title={copied ? "Copied" : "Copy"}
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-slate-400" />
          )}
        </button>
      </div>
    </div>
  );
}
