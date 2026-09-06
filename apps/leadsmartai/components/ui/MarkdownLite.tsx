"use client";

import type { ReactNode } from "react";

/**
 * Lightweight Markdown renderer for AI-authored text (Max's replies, run
 * reports, the AI Guide). Handles the cases the models actually emit —
 * `### headings`, `**bold**`, `- bullets` — with no dependency, so agents
 * see formatting instead of literal asterisks.
 */
function renderInline(text: string): ReactNode[] {
  // Split on **bold**; odd-indexed segments are the bold captures.
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-gray-900">
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function MarkdownLite({ text }: { text: string }) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flushList = (key: string) => {
    if (list.length) {
      blocks.push(
        <ul key={key} className="my-1 ml-4 list-disc space-y-0.5">
          {list}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, "");
    if (/^#{1,6}\s+/.test(line)) {
      flushList(`ul-${idx}`);
      blocks.push(
        <p key={idx} className="mb-0.5 mt-2 font-bold text-gray-900">
          {renderInline(line.replace(/^#{1,6}\s+/, ""))}
        </p>,
      );
    } else if (/^\s*[-*]\s+/.test(line)) {
      list.push(<li key={idx}>{renderInline(line.replace(/^\s*[-*]\s+/, ""))}</li>);
    } else if (line.trim() === "") {
      flushList(`ul-${idx}`);
    } else {
      flushList(`ul-${idx}`);
      blocks.push(
        <p key={idx} className="my-0.5">
          {renderInline(line)}
        </p>,
      );
    }
  });
  flushList("ul-end");
  return <div className="space-y-0.5">{blocks}</div>;
}
