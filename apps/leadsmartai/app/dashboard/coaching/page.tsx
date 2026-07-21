import type { Metadata } from "next";

import CoachingClient from "./CoachingClient";

export const metadata: Metadata = {
  title: "Coaching | CloseBoss",
  robots: { index: false },
};

export default function CoachingPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Coaching
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Where your week needs your attention. Each card is pulled live
          from data already in CloseBoss — no extra setup.
        </p>
      </header>

      <CoachingClient />
    </main>
  );
}
