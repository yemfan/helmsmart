"use client";

import { useMemo } from "react";

import PresentationView from "@/components/presentations/PresentationView";

/**
 * Public/shared presentation page. Thin wrapper around the shared
 * PresentationView (single source of truth for rendering + PDF) plus a
 * copy-link control. PresentationView normalizes any historical data
 * shape, so old share links never crash.
 */
export default function PresentationPublicClient({
  presentationId,
  data,
  propertyAddress,
}: {
  presentationId: string;
  data: Record<string, any> | null | undefined;
  propertyAddress?: string;
}) {
  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/presentation/${encodeURIComponent(presentationId)}`;
  }, [presentationId]);

  const handleCopyShareLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert("Link copied!");
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={handleCopyShareLink}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Copy link
          </button>
        </div>
        <PresentationView data={data} propertyAddress={propertyAddress} />
      </div>
    </div>
  );
}
