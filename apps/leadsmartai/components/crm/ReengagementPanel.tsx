"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type StatusPayload = {
  campaignCount?: number;
  campaigns?: { id: string; name: string | null; status: string | null }[];
};

export function ReengagementPanel({ isAdmin }: { isAdmin: boolean }) {
  const { t } = useTranslation("dashboard");
  const [status, setStatus] = useState<StatusPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [runAllAgents, setRunAllAgents] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/reengagement/status", { cache: "no-store" });
      const json = (await res.json()) as { success?: boolean; campaignCount?: number; campaigns?: StatusPayload["campaigns"]; error?: string };
      if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to load status");
      setStatus({ campaignCount: json.campaignCount, campaigns: json.campaigns });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function bootstrap() {
    setBootLoading(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/reengagement/bootstrap", { method: "POST" });
      const json = (await res.json()) as { success?: boolean; created?: boolean; reason?: string; error?: string };
      if (!res.ok || !json?.success) throw new Error(json?.error || "Bootstrap failed");
      if (json.created) setMessage("Default SMS campaign created (3-step sequence: day 0, 2, 5).");
      else if (json.reason === "already_has_campaigns") setMessage("You already have at least one campaign.");
      else setMessage("Done.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bootstrap failed");
    } finally {
      setBootLoading(false);
    }
  }

  async function runNow() {
    setRunLoading(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/admin/reengagement/run-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAdmin && runAllAgents ? { allAgents: true } : {}),
      });
      const json = (await res.json()) as { success?: boolean; count?: number; error?: string };
      if (!res.ok || !json?.success) throw new Error(json?.error || "Run failed");
      setMessage(`Processed ${json.count ?? 0} send / skip / fail events.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{t("pages.reengagement.title")}</h2>
      <p className="mt-1 text-sm text-slate-600">
        {t("pages.reengagement.subBefore")} <code className="text-xs">CRON_SECRET</code> {t("pages.reengagement.subAfter")}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh status"}
        </button>
        <button
          type="button"
          onClick={() => void bootstrap()}
          disabled={bootLoading}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 disabled:opacity-60"
        >
          {bootLoading ? "Creating…" : "Create default campaign"}
        </button>
        <button
          type="button"
          onClick={() => void runNow()}
          disabled={runLoading}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {runLoading ? "Running…" : "Run for my brokerage seat"}
        </button>
      </div>

      {isAdmin ? (
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={runAllAgents}
            onChange={(e) => setRunAllAgents(e.target.checked)}
            className="rounded border-slate-300"
          />{t("pages.reengagement.adminRun")}</label>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      {message ? <p className="mt-3 text-sm text-emerald-800">{message}</p> : null}

      <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <div className="font-medium text-slate-900">Active campaigns: {status?.campaignCount ?? "—"}</div>
        {status?.campaigns?.length ? (
          <ul className="mt-2 list-inside list-disc text-xs text-slate-600">
            {status.campaigns.map((c) => (
              <li key={c.id}>
                {(c.name || "Untitled") + ` — ${c.status ?? ""}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-500">{t("pages.reengagement.empty")}</p>
        )}
      </div>
    </div>
  );
}
