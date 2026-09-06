"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GenerateDraftButton({
  contactId,
  templateId,
}: {
  contactId: string;
  templateId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [msg, setMsg] = useState<string | null>(null);

  async function generate() {
    setPending(true);
    setStatus("idle");
    setMsg(null);
    try {
      const res = await fetch("/api/dashboard/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          templateId,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Generate failed");
      setStatus("ok");
      setMsg("Draft created — check the inbox");
      router.refresh();
    } catch (e: unknown) {
      setStatus("error");
      setMsg(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void generate()}
        disabled={pending}
        className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {pending ? "…" : "Generate draft"}
      </button>
      {status === "ok" && <span className="text-[10px] text-green-700">{msg}</span>}
      {status === "error" && <span className="text-[10px] text-red-600">{msg}</span>}
    </span>
  );
}
