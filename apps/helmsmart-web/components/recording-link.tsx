"use client";

import { Mic } from "lucide-react";
import { useTranslation } from "react-i18next";

/**
 * Call-recording link shown inside a transcript's <summary>. It lives in its own
 * Client Component because of the onClick (stopPropagation, so opening the
 * recording doesn't also toggle the parent <details>) — the /voice page is a
 * Server Component, and Server Components cannot pass event handlers.
 */
export function RecordingLink({ href }: { href: string }) {
  const { t } = useTranslation("voice");
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700"
    >
      <Mic className="w-3 h-3" />
      {t("recording.label")}
    </a>
  );
}
