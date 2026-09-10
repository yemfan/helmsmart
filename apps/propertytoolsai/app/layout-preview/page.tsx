"use client";

import { PremiumSidebar, PremiumTopbar, type NavSection } from "@repo/ui";
import { useState } from "react";
import navConfig, { propertyToolsNav as propertyToolsNavSections } from "@/nav.config";
import { leadSmartNav as leadSmartNavProduction } from "../../../leadsmartai/nav.config";

/**
 * Combined preview for PropertyToolsAI + CloseBoss using **production** `@repo/ui` navigation.
 * Route: `/layout-preview` — not indexed (see `layout.tsx`).
 */

const propertyToolsNav = propertyToolsNavSections as NavSection[];
const leadSmartNav = leadSmartNavProduction as NavSection[];

function StatCard({ title, value, sub }: { title: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{value}</div>
      <div className="mt-1 text-sm text-gray-500">{sub}</div>
    </div>
  );
}

function SampleTable() {
  const rows = [
    ["Sarah Chen", "Arcadia", "88", "Hot Lead", "AI SMS sent"],
    ["John Smith", "Pasadena", "74", "Contacted", "Viewed report"],
    ["Amy Zhao", "Irvine", "81", "Qualified", "Call scheduled"],
  ] as const;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-5 py-4 text-sm font-medium text-gray-900">Lead Activity</div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-500">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">City</th>
              <th className="px-5 py-3 font-medium">Score</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Last Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-t border-gray-100">
                {row.map((cell, idx) => (
                  <td key={idx} className="px-5 py-4 text-gray-700">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PropertyToolsPreview() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-gray-50 shadow-xl">
      <div className="flex min-h-[760px] flex-col">
        <div className="shrink-0">
          <PremiumTopbar
            appName="PropertyTools AI"
            sections={propertyToolsNav}
            searchPlaceholder="Search address, city, zip..."
            rightActions={[
              { label: "Login", href: "/login", variant: "ghost" },
              { label: "Sign Up", href: "/signup", variant: "outline" },
              { label: "Unlock Premium", href: "/pricing" },
            ]}
            profileVariant="chip"
            profileHref="/login"
            profileName="Guest User"
            profileEmail="Sign in to save results"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <PremiumSidebar
            appName="PropertyTools AI"
            sections={propertyToolsNav}
            workspaceLabel={navConfig.sidebarTitle ?? "Tools"}
            branding="none"
            height="stretch"
          />

          <main className="min-h-0 min-w-0 flex-1 space-y-6 overflow-y-auto p-4 md:p-6">
            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr] lg:items-center">
                <div>
                  <div className="mb-3 inline-flex rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600">
                    Quick Start
                  </div>
                  <h2 className="text-3xl font-semibold tracking-tight text-gray-900">
                    All the Property Tools You Need — In One Place
                  </h2>
                  <p className="mt-3 max-w-2xl text-gray-600">
                    Check home value, compare properties, estimate mortgage, and explore AI recommendations in one workspace.
                  </p>
                  <div className="mt-5 flex max-w-xl flex-col gap-3 sm:flex-row">
                    <input
                      className="h-12 flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm outline-none"
                      placeholder="Enter property address..."
                    />
                    <button type="button" className="h-12 rounded-2xl bg-gray-900 px-5 text-sm font-medium text-white sm:h-auto">
                      Get Value
                    </button>
                  </div>
                </div>
                <div className="rounded-3xl border border-gray-200 bg-gradient-to-br from-gray-50 to-gray-100 p-5 shadow-inner">
                  <div className="text-sm text-gray-500">Instant Preview</div>
                  <div className="mt-3 text-3xl font-semibold text-gray-900">$1,245,000</div>
                  <div className="mt-2 text-sm text-gray-500">Range: $1.18M – $1.31M • Confidence: Medium</div>
                  <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl bg-white p-4 shadow-sm">+4.2% YoY Trend</div>
                    <div className="rounded-2xl bg-white p-4 shadow-sm">7 Local comps</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="Home Value" value="Try now" sub="Instant estimate" />
              <StatCard title="Mortgage" value="Calculate" sub="Monthly payment" />
              <StatCard title="Compare" value="AI Tool" sub="Find best deal" />
              <StatCard title="Refinance" value="Check" sub="Potential savings" />
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <SampleTable />
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="text-sm font-medium text-gray-900">Recommended for You</div>
                <div className="mt-4 space-y-3">
                  {[
                    "Compare this property with similar homes",
                    "Estimate mortgage affordability",
                    "Unlock AI Property Comparison",
                  ].map((item) => (
                    <div key={item} className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function CloseBossPreview() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-gray-200 bg-gray-50 shadow-xl">
      <div className="flex min-h-[760px] flex-col md:flex-row">
        <PremiumSidebar
          appName="CloseBoss"
          sections={leadSmartNav}
          workspaceLabel="Workspace"
          footer={
            <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 p-4 text-sm text-white shadow-sm">
              3 hot leads need follow-up now.
            </div>
          }
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PremiumTopbar
            appName="CloseBoss"
            sections={leadSmartNav}
            searchPlaceholder="Search leads, clients, addresses..."
            creditsLabel="124 Credits"
            notificationHref="/"
            rightActions={[
              { label: "Billing", href: "/settings/billing", variant: "outline" },
              { label: "Upgrade", href: "/pricing" },
            ]}
            profileProfileHref="/"
            profileSettingsHref="/pricing"
            profileBillingHref="/pricing"
            profileBillingLabel="Billing & credits"
            profileName="Michael Ye"
            profileEmail="Broker Admin"
          />

          <main className="space-y-6 p-4 md:p-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard title="New Leads" value="12" sub="Needs review" />
              <StatCard title="Hot Leads" value="5" sub="Ready to contact" />
              <StatCard title="Response Speed" value="3x" sub="Faster with AI" />
              <StatCard title="Deals Closed" value="2" sub="This month" />
            </div>

            <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <div className="text-sm text-gray-500">Daily Briefing</div>
                  <h2 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">Priority actions for today</h2>
                </div>
                <button type="button" className="rounded-2xl bg-gray-900 px-4 py-2 text-sm font-medium text-white">
                  Send AI Follow-Up
                </button>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">3 leads need follow-up in Pasadena</div>
                <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">1 hot seller opened report twice</div>
                <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-700">2 new opportunities in marketplace</div>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
              <SampleTable />
              <div className="space-y-6">
                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-medium text-gray-900">Quick Actions</div>
                  <div className="mt-4 grid gap-3">
                    {["View hot leads", "Generate comparison report", "Open lead marketplace", "Launch offer assistant"].map((item) => (
                      <button
                        key={item}
                        type="button"
                        className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-left text-sm text-gray-700 transition hover:bg-gray-100"
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="text-sm font-medium text-gray-900">AI Summary</div>
                  <p className="mt-3 text-sm leading-6 text-gray-600">
                    Lead quality is strongest in Pasadena and Arcadia today. Buyer intent is rising on high-value homes, and response
                    time remains your biggest conversion advantage.
                  </p>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export default function CombinedLayoutPreviewPage() {
  const [mode, setMode] = useState<"propertytools" | "leadsmart">("propertytools");

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 shadow-sm">
              Layout Preview
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-gray-900 md:text-4xl">Combined Premium Navigation Preview</h1>
            <p className="mt-3 max-w-3xl text-gray-600">
              Live preview of shared <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">@repo/ui</code> components (
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">PremiumSidebar</code>,{" "}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">PremiumTopbar</code>) with each app&apos;s production{" "}
              <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">nav.config</code>.
            </p>
          </div>

          <div className="inline-flex rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode("propertytools")}
              className={[
                "rounded-xl px-4 py-2 text-sm font-medium transition",
                mode === "propertytools" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100",
              ].join(" ")}
            >
              PropertyTools AI
            </button>
            <button
              type="button"
              onClick={() => setMode("leadsmart")}
              className={[
                "rounded-xl px-4 py-2 text-sm font-medium transition",
                mode === "leadsmart" ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100",
              ].join(" ")}
            >
              CloseBoss
            </button>
          </div>
        </div>

        {mode === "propertytools" ? <PropertyToolsPreview /> : <CloseBossPreview />}
      </div>
    </main>
  );
}
