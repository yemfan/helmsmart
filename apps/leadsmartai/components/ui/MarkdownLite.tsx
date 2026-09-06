"use client";

import type { ReactNode } from "react";

import { parseInline } from "@/lib/markdown/inline";

/**
 * Lightweight Markdown renderer for AI-authored text (Max's replies, run
 * reports, the AI Guide). Handles the cases the models actually emit —
 * `### headings`, `**bold**`, `[links](/somewhere)`, `- bullets` — with no
 * dependency, so agents see formatting instead of literal punctuation.
 *
 * The decisions live in lib/markdown/inline.ts, which is pure and tested —
 * including which hrefs are allowed to become anchors at all. This file only
 * turns pieces into elements.
 */
function renderInline(text: string): ReactNode[] {
  return parseInline(text).map((piece, i) => {
    if (piece.kind === "bold") {
      return (
        <strong key={i} className="font-semibold text-slate-900">
          {piece.text}
        </strong>
      );
    }
    if (piece.kind === "link") {
      return (
        <a key={i} href={piece.href} className="font-medium text-[#0072ce] underline hover:no-underline">
          {piece.text}
        </a>
      );
    }
    return <span key={i}>{piece.text}</span>;
  });
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
        <p key={idx} className="mb-0.5 mt-2 font-bold text-slate-900">
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
