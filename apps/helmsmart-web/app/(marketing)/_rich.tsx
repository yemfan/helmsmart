import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Renders a translated string that carries inline emphasis, bold, or links.
 *
 * A sentence that wraps one phrase in a `<span>` or an `<a>` used to be built
 * out of two half-strings in the JSX. That cannot be translated: Chinese puts
 * the emphasised phrase somewhere else in the sentence, and a translator
 * handed "Still have questions? " and "Chat with us." separately has no way
 * to reorder them. So the whole sentence is ONE key and the markers travel
 * inside the value:
 *
 *   "Still have questions? <a>Chat with us.</a>"
 *   "…never misses a beat — <em>automatically.</em>"
 *   "<b>Opt-out:</b> reply <b>STOP</b> at any time to unsubscribe."
 *
 * `<a>` carries no href — the destination is a route, not copy, so it stays
 * in the source and is supplied here in the order the links appear.
 */
export interface RichLink {
  href: string;
  className?: string;
  external?: boolean;
}

export interface RichOptions {
  /** Class for the `<em>` spans — the highlight colour is the page's, not the copy's. */
  emClassName?: string;
  /** Class for the `<b>` runs. */
  strongClassName?: string;
  /** One entry per `<a>` in the string, in order. */
  links?: RichLink[];
}

const TOKEN = /(<em>[\s\S]*?<\/em>|<b>[\s\S]*?<\/b>|<a>[\s\S]*?<\/a>)/g;

export function rich(text: string, options: RichOptions = {}): ReactNode[] {
  const { emClassName, strongClassName, links = [] } = options;
  let linkIndex = 0;

  return text.split(TOKEN).map((part, i) => {
    if (part.startsWith("<em>")) {
      return (
        <span key={i} className={emClassName}>
          {part.slice(4, -5)}
        </span>
      );
    }
    if (part.startsWith("<b>")) {
      return (
        <strong key={i} className={strongClassName}>
          {part.slice(3, -4)}
        </strong>
      );
    }
    if (part.startsWith("<a>")) {
      const label = part.slice(3, -4);
      const link = links[linkIndex++];
      if (!link) return <span key={i}>{label}</span>;
      return (
        <Link
          key={i}
          href={link.href}
          className={link.className}
          {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        >
          {label}
        </Link>
      );
    }
    return part;
  });
}
