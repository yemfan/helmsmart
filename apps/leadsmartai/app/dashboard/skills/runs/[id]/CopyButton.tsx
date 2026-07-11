"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
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
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
