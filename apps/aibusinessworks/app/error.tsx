"use client";

import Link from "next/link";

/**
 * The last line of defence. A partner platform must never show a raw stack
 * trace or a blank screen - it says what happened, what it means for their
 * data, and what to do next.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas-alt px-6">
      <div className="max-w-lg text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Something went wrong on our side
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          This page failed to load. No commission, customer or payout data was changed by this
          error. Try again, and if it keeps happening, send us the reference below.
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-xs text-navy-500">Reference: {error.digest}</p>
        ) : null}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-hairline bg-white px-5 py-2.5 text-sm font-semibold text-navy-700 hover:border-navy-300"
          >
            Go to the homepage
          </Link>
        </div>
      </div>
    </div>
  );
}
