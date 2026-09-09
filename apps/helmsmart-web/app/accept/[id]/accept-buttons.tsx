"use client";

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface Props {
  estimateId: string;
}

export function AcceptButtons({ estimateId }: Props) {
  const { t } = useTranslation("auth");
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<"accepted" | "declined" | null>(null);
  const [activeAction, setActiveAction] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(action: "accept" | "decline") {
    setActiveAction(action);
    setError(null);
    startTransition(async () => {
      try {
        const status = action === "accept" ? "accepted" : "declined";
        const resp = await fetch(`/api/estimates/${estimateId}/respond`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        setDone(status);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("common:errors.generic")
        );
      } finally {
        setActiveAction(null);
      }
    });
  }

  if (done === "accepted") {
    return (
      <div
        style={{
          marginTop: 32,
          background: "#f0fdf4",
          border: "1px solid #bbf7d0",
          borderRadius: 12,
          padding: "20px 24px",
          textAlign: "center",
        }}
      >
        <CheckCircle2
          style={{
            width: 40,
            height: 40,
            color: "#16a34a",
            margin: "0 auto 12px",
          }}
        />
        <p
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "#15803d",
          }}
        >
          {t("accept.accepted.title")}
        </p>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "#166534",
          }}
        >
          {t("accept.accepted.body")}
        </p>
      </div>
    );
  }

  if (done === "declined") {
    return (
      <div
        style={{
          marginTop: 32,
          background: "#fff1f2",
          border: "1px solid #fecdd3",
          borderRadius: 12,
          padding: "20px 24px",
          textAlign: "center",
        }}
      >
        <XCircle
          style={{
            width: 40,
            height: 40,
            color: "#dc2626",
            margin: "0 auto 12px",
          }}
        />
        <p
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 600,
            color: "#b91c1c",
          }}
        >
          {t("accept.declined.title")}
        </p>
        <p
          style={{
            margin: "6px 0 0",
            fontSize: 13,
            color: "#991b1b",
          }}
        >
          {t("accept.declined.body")}
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 36 }}>
      <p
        style={{
          textAlign: "center",
          fontSize: 14,
          color: "#64748b",
          marginBottom: 16,
        }}
      >
        {t("accept.buttons.prompt")}
      </p>
      {error && (
        <p
          style={{
            textAlign: "center",
            fontSize: 12,
            color: "#dc2626",
            marginBottom: 12,
          }}
        >
          {error}
        </p>
      )}
      <div style={{ display: "flex", gap: 12 }}>
        <button
          onClick={() => handleAction("accept")}
          disabled={isPending}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "14px 24px",
            background: "#16a34a",
            color: "#ffffff",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 600,
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {isPending && activeAction === "accept" ? (
            <Loader2 style={{ width: 18, height: 18 }} />
          ) : (
            <CheckCircle2 style={{ width: 18, height: 18 }} />
          )}
          {t("accept.buttons.accept")}
        </button>
        <button
          onClick={() => handleAction("decline")}
          disabled={isPending}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "14px 24px",
            background: "#ffffff",
            color: "#64748b",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            fontSize: 15,
            fontWeight: 500,
            cursor: isPending ? "not-allowed" : "pointer",
            opacity: isPending ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {isPending && activeAction === "decline" ? (
            <Loader2 style={{ width: 16, height: 16 }} />
          ) : (
            <XCircle style={{ width: 16, height: 16 }} />
          )}
          {t("accept.buttons.decline")}
        </button>
      </div>
    </div>
  );
}
