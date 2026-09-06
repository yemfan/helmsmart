"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { trackHubEvent } from "./hubEvents";

/**
 * A link that records why it was clicked before it goes anywhere.
 *
 * In-page anchors (`#assistant`) scroll smoothly and, for the assistant,
 * focus its input so a tap on "Talk to my AI assistant" lands the visitor
 * ready to type rather than staring at a heading.
 */
export default function TrackedLink({
  username,
  href,
  event,
  meta,
  className,
  children,
  external,
  ariaLabel,
}: {
  username: string;
  href: string;
  event: string;
  meta?: Record<string, string | undefined>;
  className?: string;
  children: ReactNode;
  external?: boolean;
  ariaLabel?: string;
}) {
  const isAnchor = href.startsWith("#");
  const isExternal = external || /^https?:\/\//i.test(href) || href.startsWith("tel:") || href.startsWith("mailto:");

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    trackHubEvent(username, event, meta);
    if (isAnchor) {
      const el = document.getElementById(href.slice(1));
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        // Let the scroll start, then put the cursor where the action is.
        window.setTimeout(() => {
          const input = el.querySelector<HTMLElement>("[data-hub-focus]");
          input?.focus({ preventScroll: true });
        }, 350);
        history.replaceState(null, "", href);
      }
    }
  };

  if (isAnchor || isExternal) {
    return (
      <a
        href={href}
        onClick={onClick}
        className={className}
        aria-label={ariaLabel}
        {...(isExternal && !href.startsWith("tel:") && !href.startsWith("mailto:")
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={onClick} className={className} aria-label={ariaLabel}>
      {children}
    </Link>
  );
}
