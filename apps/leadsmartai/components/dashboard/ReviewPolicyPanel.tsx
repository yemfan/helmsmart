"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  AgentMessageSettings,
  ReviewPolicy,
  ReviewPolicyByCategory,
} from "@/lib/agent-messaging/types";

type State = Pick<AgentMessageSettings, "reviewPolicy" | "reviewPolicyByCategory">;

const DEFAULT_STATE: State = {
  reviewPolicy: "review",
  reviewPolicyByCategory: { sphere: "review", lead_response: "review" },
};

export default function ReviewPolicyPanel() {
  const [state, setState] = useState<State>(DEFAULT_STATE);
  const [saved, setSaved] = useState<State>(DEFAULT_STATE);
  const [onboardingGate, setOnboardingGate] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const isDirty =
    state.reviewPolicy !== saved.reviewPolicy ||
    state.reviewPolicyByCategory.sphere !== saved.reviewPolicyByCategory.sphere ||
    state.reviewPolicyByCategory.lead_response !== saved.reviewPolicyByCategory.lead_response;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent-message-settings");
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: AgentMessageSettings;
        onboardingGateActive?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || "Failed to load");
      }
      const next: State = {
        reviewPolicy: data.settings.reviewPolicy,
        reviewPolicyByCategory: data.settings.reviewPolicyByCategory,
      };
      setState(next);
      setSaved(next);
      setOnboardingGate(Boolean(data.onboardingGateActive));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/agent-message-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewPolicy: state.reviewPolicy,
          reviewPolicyByCategory: state.reviewPolicyByCategory,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        settings?: AgentMessageSettings;
        onboardingGateActive?: boolean;
        error?: string;
      };
      if (!res.ok || !data.ok || !data.settings) {
        throw new Error(data.error || "Save failed");
      }
      const next: State = {
        reviewPolicy: data.settings.reviewPolicy,
        reviewPolicyByCategory: data.settings.reviewPolicyByCategory,
      };
      setState(next);
      setSaved(next);
      setOnboardingGate(Boolean(data.onboardingGateActive));
      setMessage("Saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="text-sm text-gray-500" aria-busy="true">
        Loading review policy…
      </div>
    );
  }

  // The 30-day hard lock on autosend was retired — the UI now nudges
  // toward "Review each one" during the first 30 days via a recommendation
  // badge instead of disabling the faster options outright. Agents who
  // know what they're doing can self-select autosend from day one.
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <ChoiceItem
          label="Review each one"
          sublabel="Safer. Every triggered message becomes a draft in your approval queue. Nothing sends silently."
          note="Recommended for your first 30 days, or if you're coming back after a break."
          recommended={onboardingGate}
          active={state.reviewPolicy === "review"}
          onSelect={() => setState((s) => ({ ...s, reviewPolicy: "review" }))}
        />
        <ChoiceItem
          label="Autosend everything"
          sublabel="Faster. Messages go out the moment triggers fire. You'll see them in the history log."
          note="Best once you trust how the templates read in your voice."
          active={state.reviewPolicy === "autosend"}
          onSelect={() => setState((s) => ({ ...s, reviewPolicy: "autosend" }))}
        />
        <ChoiceItem
          label="Let me pick per category"
          sublabel="Different rules for different types — review sphere outreach, autosend tour confirmations."
          active={state.reviewPolicy === "per_category"}
          onSelect={() => setState((s) => ({ ...s, reviewPolicy: "per_category" }))}
        />
      </div>

      {state.reviewPolicy === "per_category" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-700">Policy by category</div>
          <CategoryRow
            title="Sphere · past clients"
            description="Home anniversaries, equity updates, dormant re-engage, referral thank-yous."
            value={state.reviewPolicyByCategory.sphere}
            onChange={(v) =>
              setState((s) => ({
                ...s,
                reviewPolicyByCategory: { ...s.reviewPolicyByCategory, sphere: v },
              }))
            }
          />
          <CategoryRow
            title="Lead response · new inquiries"
            description="First-touch, no-reply follow-ups, tour confirmations. Speed matters here."
            value={state.reviewPolicyByCategory.lead_response}
            onChange={(v) =>
              setState((s) => ({
                ...s,
                reviewPolicyByCategory: { ...s.reviewPolicyByCategory, lead_response: v },
              }))
            }
          />
          <CategoryRow
            title="Lifecycle · from CloseBoss"
            description="Product emails about your account — trial ending, feature updates."
            value="autosend"
            onChange={() => {}}
            locked
            lockedReason="Lifecycle emails come from CloseBoss, not from you. They always send automatically."
          />
        </div>
      )}

      <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
          What this means right now
        </div>
        <div className="mt-1 text-sm text-gray-700">
          <EffectiveSummary state={state} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || !isDirty}
          className="rounded-lg bg-brand-accent text-white text-sm font-medium px-4 py-2 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {message ? <span className="text-sm text-green-700">{message}</span> : null}
        {error ? <span className="text-sm text-red-600">{error}</span> : null}
      </div>
    </div>
  );
}

function EffectiveSummary({ state }: { state: State }) {
  if (state.reviewPolicy === "review") {
    return <>Every message from every trigger becomes a draft. You&apos;ll get a notification, tap approve, and it sends.</>;
  }
  if (state.reviewPolicy === "autosend") {
    return <>Every message sends the moment its trigger fires. You&apos;ll see them in your history after the fact.</>;
  }
  const s = state.reviewPolicyByCategory.sphere === "review" ? "reviewed before sending" : "sent automatically";
  const lr = state.reviewPolicyByCategory.lead_response === "review" ? "reviewed before sending" : "sent automatically";
  return (
    <>
      Sphere: <strong>{s}</strong>. Lead response: <strong>{lr}</strong>. Lifecycle: always autosend.
    </>
  );
}

function ChoiceItem({
  label,
  sublabel,
  note,
  active,
  recommended,
  onSelect,
}: {
  label: string;
  sublabel: string;
  note?: string;
  active: boolean;
  /** Soft nudge — surfaces a "Recommended" chip, no selection enforcement. */
  recommended?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer ${
        active
          ? "border-brand-accent bg-brand-accent/5"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <span
        className={`mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
          active ? "border-brand-accent" : "border-gray-300"
        }`}
      >
        {active && <span className="h-2 w-2 rounded-full bg-brand-accent" />}
      </span>
      <span className="flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{label}</span>
          {recommended && (
            <span className="inline-flex items-center rounded-full border border-brand-accent/40 bg-brand-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-accent-text">
              Recommended
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-gray-600">{sublabel}</span>
        {note && <span className="mt-1 block text-[11px] text-gray-500 italic">{note}</span>}
      </span>
    </button>
  );
}

function CategoryRow({
  title,
  description,
  value,
  onChange,
  locked,
  lockedReason,
}: {
  title: string;
  description: string;
  value: "review" | "autosend";
  onChange: (v: "review" | "autosend") => void;
  locked?: boolean;
  lockedReason?: string;
}) {
  return (
    <div
      className={`flex items-start justify-between gap-3 rounded-md bg-white border border-gray-200 p-3 ${
        locked ? "opacity-75" : ""
      }`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">{title}</div>
        <div className="text-xs text-gray-500">{description}</div>
        {locked && lockedReason && (
          <div className="mt-1 text-[11px] italic text-amber-700">{lockedReason}</div>
        )}
      </div>
      <SegToggle
        value={value}
        onChange={onChange}
        disabled={locked}
        options={[
          { id: "review", label: "Review" },
          { id: "autosend", label: "Autosend" },
        ]}
      />
    </div>
  );
}

function SegToggle<T extends string>({
  value,
  onChange,
  disabled,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  options: { id: T; label: string }[];
}) {
  return (
    <div
      className={`inline-flex rounded-md border border-gray-200 bg-gray-50 p-0.5 text-xs ${
        disabled ? "opacity-60" : ""
      }`}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => !disabled && onChange(o.id)}
          disabled={disabled}
          className={`rounded px-3 py-1 font-medium ${
            value === o.id
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Re-exported for use by other panels in the Messages tab if needed.
export type { ReviewPolicy, ReviewPolicyByCategory };
