"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";

// Labels live in the `nav` bundle under `books.<key>`; the hrefs are the
// stable part.
const TABS = [
  { key: "overview",     href: "/books" },
  { key: "transactions", href: "/books/transactions" },
  { key: "invoices",     href: "/books/invoices" },
  { key: "recurring",    href: "/books/invoices/recurring" },
  { key: "estimates",    href: "/books/estimates" },
  { key: "expenses",     href: "/books/expenses" },
  { key: "bills",        href: "/books/bills" },
  { key: "vendors",      href: "/books/vendors" },
  { key: "journal",      href: "/books/journal" },
  { key: "accounts",     href: "/books/accounts" },
  { key: "aging",        href: "/books/aging" },
  { key: "reports",      href: "/books/reports" },
] as const;

export function BooksNav() {
  const pathname = usePathname();
  const { t } = useTranslation("nav");

  return (
    /*
     * `overflow-x-auto` and `whitespace-nowrap` are load-bearing, not polish.
     * Twelve tabs fit at a desktop width in English and in Chinese, which is
     * compact. They do not fit in Spanish: "Facturas de proveedor" and
     * "Antigüedad de saldos" push the row to 1227px inside a 1021px column, so
     * the last two tabs were clipped with no way to reach them — the page
     * itself does not scroll sideways, so nothing hinted they were there.
     * A translation must never be able to make navigation unreachable.
     */
    <nav className="flex gap-1 border-b border-slate-200 mb-6 -mt-2 overflow-x-auto whitespace-nowrap">
      {TABS.map(({ key, href }) => {
        const active = (() => {
          if (href === "/books") return pathname === "/books";
          // /books/invoices should NOT activate when we're on the Recurring sub-page
          if (href === "/books/invoices") {
            return (
              pathname === "/books/invoices" ||
              (pathname.startsWith("/books/invoices/") &&
                !pathname.startsWith("/books/invoices/recurring"))
            );
          }
          return pathname === href || pathname.startsWith(`${href}/`);
        })();

        return (
          <Link
            key={href}
            href={href}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              active
                ? "text-indigo-600 border-b-2 border-indigo-600 -mb-px bg-white"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            {t(`books.${key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
