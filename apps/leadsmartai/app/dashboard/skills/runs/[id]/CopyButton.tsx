"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";

export function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation("dashboard");
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
    >
      {copied ? t("pages.skillRun.copied") : t("pages.skillRun.copy")}
    </button>
  );
}
