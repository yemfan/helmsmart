"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

type QueueLead = {
  id: number | string;
  name: string | null;
  email: string | null;
  property_address: string | null;
  source: string | null;
  created_at: string | null;
};

export function AddContactClient() {
  const { t } = useTranslation("dashboard");
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [property_address, setPropertyAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [forceCreate, setForceCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dup, setDup] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Lead queue state
  const [queueLeads, setQueueLeads] = useState<QueueLead[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimFeedback, setClaimFeedback] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/lead-queue?pageSize=5");
      const body = await res.json().catch(() => ({}));
      if (body.ok) setQueueLeads(body.leads ?? []);
    } catch {
      // silent
    } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  async function claimLead(leadId: string) {
    setClaiming(leadId);
    setClaimFeedback(null);
    try {
      const res = await fetch("/api/dashboard/lead-queue/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.ok) {
        setClaimFeedback("Lead claimed! Redirecting to your leads...");
        setTimeout(() => { router.push("/dashboard/leads"); router.refresh(); }, 1000);
      } else if (res.status === 409) {
        setClaimFeedback("Already claimed by another agent.");
        fetchQueue();
      } else {
        setClaimFeedback(body.error ?? "Failed to claim.");
      }
    } catch {
      setClaimFeedback("Network error.");
    } finally {
      setClaiming(null);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    setDup(null);
    try {
      const res = await fetch("/api/dashboard/contacts/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || null,
          email: email || null,
          phone: phone || null,
          property_address: property_address || null,
          notes: notes || null,
          source: "manual_entry",
          forceCreate,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setDup(
          body.duplicate
            ? `Possible duplicate — lead #${body.duplicate.leadId} (score ${body.duplicate.score})`
            : body.message || "Duplicate"
        );
        return;
      }
      if (!res.ok) throw new Error(body.error || "Could not save");
      router.push("/dashboard/leads");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  function timeAgo(dateStr: string | null) {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8 pb-24 sm:pb-8">
      <Link href="/dashboard/leads" className="text-sm font-medium text-slate-600 dark:text-slate-400">
        &larr; Leads
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{t("pages.addContact.heading")}</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">{t("pages.addContact.intro")}</p>
      </header>

      {/* Lead Queue Section */}
      {!queueLoading && queueLeads.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("pages.addContact.availableLeads")}</h2>
            <Link href="/dashboard/lead-queue" className="text-xs font-medium text-blue-600 hover:underline">{t("pages.addContact.viewAll")}</Link>
          </div>

          {claimFeedback && (
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              {claimFeedback}
            </p>
          )}

          <div className="space-y-2">
            {queueLeads.map((lead) => {
              const id = String(lead.id);
              return (
                <div
                  key={id}
                  className="flex items-center justify-between rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {lead.name || t("pages.addContact.unnamed")}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {lead.property_address || lead.email || t("pages.addContact.noDetails")}
                      {" · "}
                      {lead.source ?? "unknown"}
                      {" · "}
                      {timeAgo(lead.created_at)}
                    </p>
                  </div>
                  <button
                    disabled={claiming === id}
                    onClick={() => claimLead(id)}
                    className="ml-3 shrink-0 rounded-lg bg-[#0072ce] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#005ca8] disabled:opacity-50"
                  >
                    {claiming === id ? "..." : t("pages.addContact.claim")}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="border-b border-slate-200 dark:border-slate-700" />
          <p className="text-center text-xs text-slate-500">{t("pages.addContact.orManual")}</p>
        </div>
      )}

      {/* Manual Add Form */}
      <div className="space-y-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">{t("pages.addContact.name")}<input
            className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-base"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">{t("pages.addContact.email")}<input
            className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-base"
            inputMode="email"
            autoCapitalize="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">{t("pages.addContact.phone")}<input
            className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-base"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">{t("pages.addContact.property")}<input
            className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 dark:border-slate-700 px-3 text-base"
            value={property_address}
            onChange={(e) => setPropertyAddress(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium text-slate-800 dark:text-slate-200">{t("pages.addContact.notes")}<textarea
            className="mt-1 w-full rounded-xl border border-slate-300 dark:border-slate-700 px-3 py-2 text-base"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        {dup ? <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">{dup}</p> : null}
        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={forceCreate} onChange={(e) => setForceCreate(e.target.checked)} />{t("pages.addContact.createAnyway")}</label>

        <button
          type="button"
          disabled={saving}
          className="w-full min-h-[48px] rounded-xl bg-[#0072ce] text-white text-base font-medium disabled:opacity-50"
          onClick={() => void submit()}
        >
          {saving ? t("pages.addContact.saving") : t("pages.addContact.save")}
        </button>
      </div>
    </div>
  );
}
