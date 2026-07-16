"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLinks } from "@/lib/content";

export function NavLinks() {
  const pathname = usePathname();

  return (
    <ul className="flex items-center gap-4 text-xs font-bold text-navy-800 sm:gap-6 sm:text-sm">
      {navLinks.map((link) => {
        // Only real page routes can be "current" — the "/#section" links are
        // positions on the homepage, not destinations of their own.
        const isCurrent = !link.href.includes("#") && pathname === link.href;
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={isCurrent ? "page" : undefined}
              className={
                isCurrent
                  ? "text-brand-500 underline decoration-2 underline-offset-[6px]"
                  : "transition-colors hover:text-brand-500"
              }
            >
              {link.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
