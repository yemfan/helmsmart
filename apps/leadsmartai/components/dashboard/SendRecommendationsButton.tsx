"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, Send, Trash2, X } from "lucide-react";
import { sanitizeHtml } from "@/lib/sanitizeHtml";

type ListingInput = {
  propertyId: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  photoUrl?: string;
};

type Favorite = {
  propertyId: string;
  address: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  photoUrl: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

type Props = {
  contactId: string;
  contactFirstName: string | null;
};

/**
 * Opens a composer for agent-curated "here are N homes for you" sends.
 * Pre-loads the contact's favorites as quick-pick candidates (they
 * already expressed interest). Agent can also paste property IDs or
 * just type the address manually.
 *
 * v1 intentionally limits to quick-pick from favorites + manual entry
 * — full listing search inside the composer is a follow-up.
 */
export default function SendRecommendationsButton({ contactId, contactFirstName }: Props) {
  const { t } = useTranslation("dashboard");
  const [open, setOpen] = useState(false);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [picked, setPicked] = useState<ListingInput[]>([]);
  const [subject, setSubject] = useState("Homes I picked for you");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: true } | { error: string } | null>(null);
  /** Per-send override — when true, the email sends without the agent's signature. */
  const [suppressSignature, setSuppressSignature] = useState(false);
  /** Cached signature preview HTML, fetched once the first time the user clicks Preview. */
  const [signaturePreview, setSignaturePreview] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "ready"; html: string }
    | { kind: "error"; msg: string }
  >({ kind: "idle" });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/contacts/${encodeURIComponent(contactId)}/favorites`,
        );
        if (cancelled) return;
        const data = (await res.json()) as { ok?: boolean; favorites?: Favorite[] };
        if (res.ok && data.ok) setFavorites(data.favorites ?? []);
      } catch {
        // non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contactId]);

  function togglePick(f: Favorite) {
    setPicked((prev) => {
      const exists = prev.find((p) => p.propertyId === f.propertyId);
      if (exists) return prev.filter((p) => p.propertyId !== f.propertyId);
      return [
        ...prev,
        {
          propertyId: f.propertyId,
          address: f.address ?? f.propertyId,
          city: f.city ?? undefined,
          state: f.state ?? undefined,
          zip: f.zip ?? undefined,
          price: f.price ?? undefined,
          beds: f.beds ?? undefined,
          baths: f.baths ?? undefined,
          sqft: f.sqft ?? undefined,
          photoUrl: f.photoUrl ?? undefined,
        },
      ];
    });
  }

  async function loadSignaturePreview() {
    setSignaturePreview({ kind: "loading" });
    try {
      const res = await fetch("/api/dashboard/branding/preview");
      const data = (await res.json()) as {
        ok?: boolean;
        signature?: { html: string };
        error?: string;
      };
      if (!res.ok || !data.ok || !data.signature) {
        throw new Error(data.error || "Preview failed");
      }
      setSignaturePreview({ kind: "ready", html: data.signature.html });
    } catch (e) {
      setSignaturePreview({
        kind: "error",
        msg: e instanceof Error ? e.message : "Preview failed",
      });
    }
  }

  async function send() {
    if (picked.length === 0) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/dashboard/contacts/${encodeURIComponent(contactId)}/recommendations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, note, listings: picked, suppressSignature }),
        },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Send failed");
      setResult({ ok: true });
      setTimeout(() => {
        setOpen(false);
        setPicked([]);
        setNote("");
        setResult(null);
      }, 1500);
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Send failed" });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
      >
        <Send className="h-3.5 w-3.5" aria-hidden />{t("pages.sendRecommendations.title")}</button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-base font-semibold text-gray-900">
                Send properties{contactFirstName ? ` to ${contactFirstName}` : ""}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("pages.sendRecommendations.close")}
                className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-5 space-y-5">
              {/* Composer */}
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("pages.sendRecommendations.subject")}</span>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-600">{t("pages.sendRecommendations.note")}</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Hey — based on what you've been looking at, thought these three might be worth a closer look…"
                    className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </label>
              </div>

              {/* Quick pick from favorites */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Pick from their favorites ({favorites.length})
                  </h3>
                </div>
                {favorites.length === 0 ? (
                  <div className="rounded border border-dashed border-gray-200 p-3 text-center text-xs text-gray-500">{t("pages.sendRecommendations.noFavorites")}</div>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {favorites.map((f) => {
                      const isPicked = picked.some((p) => p.propertyId === f.propertyId);
                      return (
                        <li key={f.propertyId}>
                          <button
                            type="button"
                            onClick={() => togglePick(f)}
                            className={`flex w-full items-start gap-3 rounded-lg border p-2 text-left transition-colors ${
                              isPicked
                                ? "border-emerald-300 bg-emerald-50"
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}
                          >
                            {f.photoUrl ? (
                              <img
                                src={f.photoUrl}
                                alt=""
                                className="h-14 w-14 shrink-0 rounded object-cover"
                              />
                            ) : (
                              <div className="h-14 w-14 shrink-0 rounded bg-gray-100" />
                            )}
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-gray-900">
                                {f.price ? `$${Math.round(f.price / 1000)}K` : "—"}
                              </div>
                              <div className="truncate text-xs text-gray-500">
                                {f.address ?? f.propertyId}
                              </div>
                              <div className="mt-0.5 text-[10px] text-gray-400">
                                {[
                                  f.beds ? `${f.beds}bd` : null,
                                  f.baths ? `${f.baths}ba` : null,
                                  f.sqft ? `${f.sqft.toLocaleString()}sf` : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Picked list */}
              {picked.length > 0 && (
                <div>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Will send ({picked.length})
                  </h3>
                  <ul className="space-y-1">
                    {picked.map((p) => (
                      <li
                        key={p.propertyId}
                        className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs"
                      >
                        <span className="truncate text-gray-800">{p.address}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPicked((prev) => prev.filter((x) => x.propertyId !== p.propertyId))
                          }
                          aria-label={t("pages.sendRecommendations.remove")}
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Signature control — per-send toggle + preview */}
              <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={!suppressSignature}
                      onChange={(e) => setSuppressSignature(!e.target.checked)}
                      className="h-3.5 w-3.5 accent-gray-900"
                    />{t("pages.sendRecommendations.includeSignature")}</label>
                  <button
                    type="button"
                    onClick={loadSignaturePreview}
                    disabled={
                      suppressSignature || signaturePreview.kind === "loading"
                    }
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    <Eye className="h-3 w-3" aria-hidden />
                    {signaturePreview.kind === "loading" ? "Loading…" : "Preview signature"}
                  </button>
                </div>
                {!suppressSignature && signaturePreview.kind === "ready" && (
                  <div
                    className="mt-2 rounded border border-gray-200 bg-white p-3 text-xs text-gray-700"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(signaturePreview.html) }}
                  />
                )}
                {signaturePreview.kind === "error" && (
                  <div className="mt-2 rounded border border-red-200 bg-red-50 p-1.5 text-[11px] text-red-700">
                    {signaturePreview.msg}
                  </div>
                )}
                <p className="mt-1.5 text-[10px] text-gray-500">
                  Configure it under Account → Profile → Branding.
                </p>
              </div>

              {result && "error" in result && (
                <div className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  {result.error}
                </div>
              )}
              {result && "ok" in result && (
                <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-800">{t("pages.sendRecommendations.sent")}</div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700"
              >{t("pages.sendRecommendations.cancel")}</button>
              <button
                type="button"
                onClick={send}
                disabled={picked.length === 0 || sending}
                className="inline-flex items-center gap-1 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
                {sending ? "Sending…" : `Send ${picked.length || ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
