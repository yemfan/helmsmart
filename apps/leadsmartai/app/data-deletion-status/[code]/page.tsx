import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

/**
 * Public status page for Meta data-deletion requests. Linked from
 * the `url` returned by `POST /api/meta/data-deletion`.
 *
 * Phase 1C scope: renders a "request received, in progress" page
 * that confirms the deletion was logged. There's no real status
 * lookup yet because there's no Meta-linked data to delete in
 * Phase 1 — the page exists so Meta's App Review URL check
 * passes, and so users who land here from their Facebook account
 * settings see a sensible message instead of a 404.
 *
 * Phase 2 plan: read the actual status from a
 * `meta_deletion_requests` table populated by the callback, and
 * render `pending` / `completed` / `failed`.
 */

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.dataDeletionStatus.title", { ns: "web_marketing" });
  const description = t("routeMeta.dataDeletionStatus.description", { ns: "web_marketing" });
  return {
  title,
  description,
  robots: { index: false, follow: false },
};
}

type PageProps = {
  params: Promise<{ code: string }>;
};

export default async function DataDeletionStatusPage({ params }: PageProps) {
  const t = await getServerT();
  const { code } = await params;

  // Basic sanity check on the code format so we don't render the
  // page for nonsense URLs. Keeps the page predictable for the
  // automated checks Meta runs during App Review.
  const isValidShape = /^[a-f0-9]{14}-[\w]+$/i.test(decodeURIComponent(code));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">{t("pages.dataCenterPages.deletionTitle", { ns: "dashboard" })}</h1>

      {isValidShape ? (
        <>
          <p className="mt-3 text-sm text-slate-600">{t("pages.dataCenterPages.deletionReceived", { ns: "dashboard" })}</p>
          <code className="mt-2 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-900">
            {decodeURIComponent(code)}
          </code>

          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-semibold text-emerald-900">{t("pages.dataCenterPages.deletionPending", { ns: "dashboard" })}</p>
            <p className="mt-1 text-sm text-emerald-800">
              {t("pages.dataCenterPages.deletionLogged", { ns: "dashboard" })}{" "}
              <a
                href="/privacy"
                className="underline hover:text-emerald-900"
              >{t("pages.articleChrome.privacyPolicy", { ns: "dashboard" })}</a>
              .
            </p>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">{t("pages.dataCenterPages.deletionUnknown", { ns: "dashboard" })}</p>
          <p className="mt-1 text-sm text-amber-800">{t("pages.dataCenterPages.deletionUnknownBody", { ns: "dashboard" })}<em>{t("pages.dataCenterPages.deletionAppsLink", { ns: "dashboard" })}</em>{t("pages.dataCenterPages.deletionSettings", { ns: "dashboard" })}{" "}
            <a
              href="mailto:contact@closebossai.com"
              className="underline hover:text-amber-900"
            >
              contact@closebossai.com
            </a>
            .
          </p>
        </div>
      )}

      <p className="mt-8 text-xs text-slate-500">
        {t("pages.dataCenterPages.deletionQuestions", { ns: "dashboard" })}{" "}
        <a
          href="mailto:contact@closebossai.com"
          className="underline hover:text-slate-700"
        >
          contact@closebossai.com
        </a>
        {t("pages.dataCenterPages.deletionWithCode", { ns: "dashboard" })}
      </p>
    </div>
  );
}
