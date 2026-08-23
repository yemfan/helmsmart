"use client";

import { useTranslation } from "react-i18next";

/**
 * The word "Loading…", in the reader's language.
 *
 * It was hardcoded in 23 places. Most were plain text nodes, but several sat in
 * a `next/dynamic` fallback at MODULE scope —
 *
 *     nextDynamic(() => import("…"), { loading: () => <p>Loading…</p> })
 *
 * — where no hook can reach, which is why a plain `t()` call could not fix them
 * all. A component can: it runs inside React, so it works the same in a
 * fallback, in a Suspense boundary, and in the middle of a page.
 *
 * `className` passes through so each caller keeps the size and colour it had.
 */
export function LoadingText({ className }: { className?: string }) {
  const { t } = useTranslation("common");
  return <span className={className}>{t("actions.loading")}</span>;
}
