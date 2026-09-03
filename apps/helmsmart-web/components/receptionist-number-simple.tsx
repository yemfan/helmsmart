"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Phone } from "lucide-react";
import { saveTwilioNumber } from "@/lib/actions/messages";
import { verifyNumberWiring } from "@/lib/actions/voice-setup";

/**
 * Enter the number you already own. That is the whole setup.
 *
 * This replaces the buy/import wizard, matching how CloseBoss does it: the
 * operator owns one number, points it at the platform once in the carrier
 * console, and the product only records which number that is. No area-code
 * search, no SIP termination URI, no trunk credentials.
 *
 * WHY THE WIZARD STILL EXISTS. `receptionist-number-wizard.tsx` is kept, not
 * deleted. It solves a real problem this does not — giving each organization
 * its OWN number, bought or imported from the customer's own Twilio account —
 * and the SIP fields it asks for are a carrier requirement, not decoration.
 * When HelmSmart needs per-tenant numbers again, that is the component to bring
 * back rather than rebuild.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, AND WHY IT SAYS SO. Saving a number only
 * writes `organizations.twilio_number`. It does NOT attach the number to the
 * Retell agent or point the inbound webhook at us — the wizard did that as a
 * side effect of buying or importing. So a saved number alone will not make the
 * agent answer, and reporting "saved" would be the same silent success that hid
 * this whole class of bug: a setting that looks applied over a feature that
 * cannot work.
 *
 * So every save is followed by `verifyNumberWiring()`, and the result is shown
 * plainly, naming which of the three checks failed.
 */

type Wiring = Awaited<ReturnType<typeof verifyNumberWiring>>;

export function ReceptionistNumberSimple({ current }: { current: string | null }) {
  const router = useRouter();
  const [number, setNumber] = useState(current ?? "");
  const [isPending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [wiring, setWiring] = useState<Wiring | null>(null);

  function handleSave() {
    setError(null);
    setWiring(null);
    start(async () => {
      const saved = await saveTwilioNumber(number);
      if (!saved.ok) {
        setError(saved.error ?? "Couldn't save that number.");
        return;
      }
      if (saved.value !== undefined) setNumber(saved.value); // normalised E.164

      // Saved is not the same as working. Say which.
      setWiring(await verifyNumberWiring());
      router.refresh();
    });
  }

  return (
    <div className="border border-slate-200 rounded-lg p-4 mb-5">
      <label className="block text-xs font-medium text-slate-600 mb-1">
        Your phone number
      </label>
      <p className="text-xs text-slate-500 mb-2">
        The number callers dial. Point it at the platform in your carrier console,
        then enter it here.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="+1 626 888 7170"
          inputMode="tel"
          className="flex-1 min-w-[220px] px-3 py-2 border border-slate-200 rounded-lg text-sm"
        />
        <button
          onClick={handleSave}
          disabled={isPending}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
          {isPending ? "Saving…" : "Save number"}
        </button>
      </div>

      {error ? (
        <p className="text-xs text-rose-600 mt-2" role="alert">
          {error}
        </p>
      ) : null}

      {wiring ? (
        wiring.ok ? (
          <p className="text-xs text-emerald-700 mt-2 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Saved and wired — the agent will answer this number.
          </p>
        ) : (
          <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Saved, but not answering calls yet
            </p>
            {/* Name the failing check — "it doesn't work" is not actionable. */}
            <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
              {!wiring.numberFound ? <li>This number isn&apos;t in the voice provider yet.</li> : null}
              {wiring.numberFound && !wiring.agentOk ? <li>It isn&apos;t attached to the receptionist agent.</li> : null}
              {wiring.numberFound && !wiring.webhookOk ? <li>Its inbound webhook doesn&apos;t point here.</li> : null}
              {wiring.error ? <li>{wiring.error}</li> : null}
            </ul>
          </div>
        )
      ) : null}
    </div>
  );
}
