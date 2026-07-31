"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { FiringOutcomeFilter, FiringRange, FiringRow } from "@/lib/scheduler/firings";

type DisplayRow = FiringRow & { contactInitials?: string };

const OUTCOME_OPTIONS: { value: FiringOutcomeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "created", label: "Created" },
  { value: "suppressed", label: "Suppressed (any)" },
  { value: "suppressed_opt_in", label: "Opt-in missing" },
  { value: "suppressed_agent_of_record", label: "Agent-of-record" },
  { value: "suppressed_template_off", label: "Template off" },
  { value: "suppressed_per_contact_trigger_off", label: "Per-contact off" },
  { value: "suppressed_other", label: "Other" },
];

const RANGE_OPTIONS: { value: FiringRange; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

export default function SchedulerActivityClient() {
  const [outcome, setOutcome] = useState<FiringOutcomeFilter>("all");
  const [range, setRange] = useState<FiringRange>("30d");
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(
    async (o: FiringOutcomeFilter, r: FiringRange) => {
      setLoading(true);
      setError(null);
      setRows([]);
      setNextCursor(null);
      setExpandedId(null);
      try {
        const url = `/api/dashboard/scheduler/firings?outcome=${o}&range=${r}&limit=50`;
        const res = await fetch(url);
        const data = (await res.json()) as {
          ok?: boolean;
          rows?: DisplayRow[];
          nextCursor?: string | null;
          error?: string;
        };
        if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
        setRows(data.rows ?? []);
        setNextCursor(data.nextCursor ?? null);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(outcome, range);
  }, [outcome, range, load]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const url = `/api/dashboard/scheduler/firings?outcome=${outcome}&range=${range}&before=${encodeURIComponent(nextCursor)}&limit=50`;
      const res = await fetch(url);
      const data = (await res.json()) as {
        ok?: boolean;
        rows?: DisplayRow[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error || "Load failed");
      setRows((prev) => [...prev, ...(data.rows ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Outcome
          </span>
          <div className="flex flex-wrap gap-1">
            {OUTCOME_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setOutcome(o.value)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  outcome === o.value
                    ? "bg-gray-900 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Range
          </span>
          <div className="flex flex-wrap gap-1">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  range === r.value
                    ? "bg-gray-900 text-white"
                    : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <div className="p-8 text-sm text-gray-500">Loading…</div>
        ) : rows.length === 0 ? (
          <EmptyState outcome={outcome} />
        ) : (
          <>
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <Th>When</Th>
                  <Th>Contact</Th>
                  <Th>Template</Th>
                  <Th>Period</Th>
                  <Th>Outcome</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r) => {
                  const expanded = expandedId === r.id;
                  return (
                    <>
                      <tr
                        key={r.id}
                        className="cursor-pointer hover:bg-gray-50/60"
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                      >
                        <Td>
                          <div className="text-gray-700">{relativeTime(r.firedAt)}</div>
                          <div className="text-[10px] text-gray-400">
                            {new Date(r.firedAt).toLocaleString()}
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <span
                              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                              style={{ background: r.contactAvatarColor ?? "#6B5D4E" }}
                            >
                              {((r.contactFirstName[0] ?? "") + (r.contactLastName?.[0] ?? "")).toUpperCase()}
                            </span>
                            <Link
                              href={`/dashboard/sphere/${r.contactId}`}
                              onClick={(e) => e.stopPropagation()}
                              className="truncate font-medium text-gray-900 hover:underline"
                            >
                              {r.contactFullName}
                            </Link>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-gray-500">{r.templateId}</span>
                            {r.templateChannel && (
                              <span
                                className={`rounded px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                                  r.templateChannel === "sms"
                                    ? "bg-blue-50 text-blue-700"
                                    : "bg-violet-50 text-violet-700"
                                }`}
                              >
                                {r.templateChannel}
                              </span>
                            )}
                          </div>
                          {r.templateName && (
                            <div className="text-[10px] text-gray-500">{r.templateName}</div>
                          )}
                        </Td>
                        <Td className="font-mono text-[10px] text-gray-500">{r.periodKey}</Td>
                        <Td>
                          <OutcomeBadge
                            draftId={r.draftId}
                            draftStatus={r.draftStatus}
                            suppressedReason={r.suppressedReason}
                          />
                        </Td>
                        <Td>
                          <button
                            type="button"
                            className="text-[10px] text-gray-500 hover:text-gray-900"
                            aria-expanded={expanded}
                          >
                            {expanded ? "▾" : "▸"}
                          </button>
                        </Td>
                      </tr>
                      {expanded && (
                        <tr className="bg-gray-50/50">
                          <td colSpan={6} className="px-3 py-3">
                            <div className="flex flex-wrap gap-6 text-[11px]">
                              {r.draftId && (
                                <Link
                                  href="/dashboard/drafts"
                                  className="text-brand-accent-text hover:underline"
                                >
                                  Open draft →
                                </Link>
                              )}
                              <div>
                                <span className="text-gray-400">Fired at: </span>
                                {new Date(r.firedAt).toISOString()}
                              </div>
                            </div>
                            <pre className="mt-2 overflow-auto rounded border border-gray-200 bg-white p-2 text-[10px] leading-snug text-gray-700">
                              {JSON.stringify(r.triggerContext, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
            {nextCursor && (
              <div className="border-t border-gray-100 p-3 text-center">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptyState({ outcome }: { outcome: FiringOutcomeFilter }) {
  if (outcome === "all") {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        <div className="font-medium text-gray-700">No scheduler activity yet.</div>
        <p className="mt-1">
          Each time the scheduler runs, every (contact × template) evaluation lands here — created,
          suppressed, already fired, and errors. Run the scheduler from the{" "}
          <Link href="/dashboard/drafts" className="text-brand-accent-text hover:underline">
            drafts page
          </Link>{" "}
          to populate this feed.
        </p>
      </div>
    );
  }
  return (
    <div className="p-8 text-center text-sm text-gray-500">
      No firings match the current filter.
    </div>
  );
}

function OutcomeBadge({
  draftId,
  draftStatus,
  suppressedReason,
}: {
  draftId: string | null;
  draftStatus: string | null;
  suppressedReason: string | null;
}) {
  if (draftId) {
    const label =
      draftStatus === "sent"
        ? "Sent"
        : draftStatus === "approved"
          ? "Approved"
          : draftStatus === "rejected"
            ? "Rejected"
            : draftStatus === "failed"
              ? "Failed"
              : "Created";
    const cls =
      draftStatus === "sent"
        ? "bg-green-50 text-green-700"
        : draftStatus === "approved"
          ? "bg-blue-50 text-blue-700"
          : draftStatus === "rejected"
            ? "bg-gray-100 text-gray-500"
            : draftStatus === "failed"
              ? "bg-red-50 text-red-700"
              : "bg-amber-50 text-amber-700";
    return (
      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
        {label}
      </span>
    );
  }
  if (suppressedReason) {
    return (
      <span
        className="inline-flex rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
        title={suppressedReason}
      >
        Suppressed · {suppressedReason.replace(/_/g, " ")}
      </span>
    );
  }
  return <span className="text-[10px] text-gray-400">—</span>;
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-gray-500">
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top ${className ?? ""}`}>{children}</td>;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
