"use client";

import { useEffect, useState } from "react";

/**
 * Who signs off before a social post goes out.
 *
 * This is the governance dial for AI-written content on the agent's own feed.
 * The three options are ordered by how much a human is involved, and each one
 * says plainly what it does — including 'auto', which is the only setting where
 * something publishes that nobody has read.
 */

type Mode = "review" | "assisted" | "auto";

const OPTIONS: {
  value: Mode;
  label: string;
  blurb: string;
  note?: string;
}[] = [
  {
    value: "review",
    label: "I approve every post",
    blurb:
      "Your week is written and scheduled at the right times, then held. Nothing publishes until you approve it in the post queue.",
  },
  {
    value: "assisted",
    label: "Boss Assistant approves",
    blurb:
      "The Boss fact-checks every post against what your product and service actually do. Posts it can verify are scheduled; anything it can't is held for you, with the reason. You can still cancel any post before it goes out.",
    note: "Measured against real mistakes before we shipped it: it caught 6 of 6 false claims and passed 7 of 7 good posts.",
  },
  {
    value: "auto",
    label: "Full autopilot",
    blurb:
      "Posts are written, scheduled and published with no check. Fastest, and the only option where something reaches your feed that nobody — human or AI — has reviewed.",
  },
];

export default function SocialApprovalPanel() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/social/mode");
        const json = await res.json();
        if (json.ok) {
          // 'ask' (drafts-only) is a legacy value with no control here; show it
          // as the closest equivalent rather than an empty selection.
          setMode(json.mode === "ask" ? "review" : (json.mode as Mode));
        }
      } catch {
        setError("Could not load your posting setting.");
      }
    })();
  }, []);

  async function choose(next: Mode) {
    const prev = mode;
    setMode(next);
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/social/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error);
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    } catch {
      setMode(prev); // revert — never show a setting we failed to save
      setError("Could not save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (mode === null) {
    return <p className="text-xs text-gray-500">Loading…</p>;
  }

  return (
    <div>
      <div className="space-y-2">
        {OPTIONS.map((opt) => {
          const active = mode === opt.value;
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                active
                  ? "border-[#0072ce] bg-blue-50/40 ring-1 ring-[#0072ce]"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              } ${saving ? "opacity-60" : ""}`}
            >
              <input
                type="radio"
                name="social-approval"
                value={opt.value}
                checked={active}
                disabled={saving}
                onChange={() => choose(opt.value)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#0072ce]"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                <span className="mt-0.5 block text-xs text-gray-600">{opt.blurb}</span>
                {opt.note && (
                  <span className="mt-1 block text-[11px] text-gray-500">{opt.note}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      {saved && <p className="mt-2 text-xs text-green-700">Saved.</p>}

      <p className="mt-3 text-[11px] text-gray-500">
        Applies to social posts. Live calls and text replies aren&apos;t covered — a
        conversation can&apos;t wait for approval, so those are governed by their own
        settings on each assistant.
      </p>
    </div>
  );
}
