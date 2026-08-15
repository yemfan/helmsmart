import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import Link from "next/link";

import LeadRoutingAdminClient from "./LeadRoutingAdminClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: t("pages.leadRouting.metaTitle", { ns: "dashboard" }),
    robots: { index: false },
  };
}

export default function LeadRoutingAdminPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          IDX lead-routing pool
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Roster of every agent in the round-robin pool — DB rules and the
          env allowlist combined. Sorted by recent activity so you can see at
          a glance who&apos;s hot and who&apos;s idle.
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Each agent edits their own rule on{" "}
          <Link
            href="/dashboard/settings"
            className="font-semibold text-slate-700 underline hover:text-slate-900"
          >
            their settings page
          </Link>
          .
        </p>
      </header>

      <LeadRoutingAdminClient />
    </main>
  );
}
