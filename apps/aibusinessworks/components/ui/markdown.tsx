import type { ReactNode } from "react";

/**
 * A deliberately small Markdown renderer for legal and policy documents.
 *
 * It builds React elements rather than injecting HTML, so administrator-edited
 * document bodies can never introduce markup into the page. Supported: h2, h3,
 * paragraphs, unordered and ordered lists, bold, and horizontal rules. Anything
 * else renders as plain text, which for a legal document is the safe failure.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    nodes.push(
      <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-ink">
        {match[1]}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
    i += 1;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    paragraph = [];
    if (!text) return;
    blocks.push(
      <p key={`p${key++}`} className="mt-4 leading-relaxed text-[15px] text-[#33405a]">
        {renderInline(text, `p${key}`)}
      </p>,
    );
  };

  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    list = null;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`l${key++}`}
        className={
          ordered
            ? "mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-[#33405a]"
            : "mt-4 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-[#33405a]"
        }
      >
        {items.map((item, idx) => (
          <li key={idx}>{renderInline(item, `li${key}-${idx}`)}</li>
        ))}
      </Tag>,
    );
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith("### ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h3 key={`h3${key++}`} className="mt-8 text-lg font-semibold text-ink">
          {line.slice(4)}
        </h3>,
      );
      continue;
    }

    if (line.startsWith("## ")) {
      flushParagraph();
      flushList();
      blocks.push(
        <h2 key={`h2${key++}`} className="mt-10 text-xl font-semibold text-ink first:mt-0">
          {line.slice(3)}
        </h2>,
      );
      continue;
    }

    if (line.trim() === "---") {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr${key++}`} className="mt-8 border-0 border-t border-hairline" />);
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line.trim());
    if (bullet) {
      flushParagraph();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(bullet[1]);
      continue;
    }

    const numbered = /^\d+\.\s+(.*)$/.exec(line.trim());
    if (numbered) {
      flushParagraph();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(numbered[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  return <div className="max-w-none">{blocks}</div>;
}
