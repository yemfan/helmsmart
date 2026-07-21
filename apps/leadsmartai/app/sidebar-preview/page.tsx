"use client";

/**
 * Sidebar redesign preview — side-by-side comparison of the current
 * `PremiumSidebar` (left) and proposed `PremiumSidebarV2` (right) using
 * the live LeadSmart agent-portal nav.
 *
 * Off the auth path on purpose: ships through `AppShell`'s bare-wrap
 * list so no marketing chrome leaks in and we don't double-render
 * sidebars on the preview page itself.
 *
 * The route renders nothing useful below `lg`; both sidebars use
 * `hidden lg:flex`. A mobile fallback message points reviewers to
 * desktop.
 */

import { PremiumSidebar, PremiumSidebarV2 } from "@repo/ui";
import { leadSmartNav } from "@/nav.config";

const PREVIEW_USER = {
  name: "Michael Ye",
  email: "fan.yes@gmail.com",
  initials: "MY",
  planLabel: "Pro",
};

function PreviewFrame({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "current" | "proposed";
  children: React.ReactNode;
}) {
  const headerTone =
    tone === "proposed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-slate-200 bg-slate-50 text-slate-600";
  const ringTone =
    tone === "proposed"
      ? "ring-emerald-500/20 border-emerald-300/60"
      : "ring-slate-900/[0.03] border-slate-200";

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-white shadow-sm ring-1 ${ringTone}`}
    >
      <div
        className={`flex items-center justify-between border-b px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] ${headerTone}`}
      >
        <span>{title}</span>
        <span className="text-[10px] font-medium normal-case tracking-normal opacity-70">
          {tone === "proposed" ? "PremiumSidebarV2" : "PremiumSidebar"}
        </span>
      </div>
      <div className="flex h-[820px] bg-[radial-gradient(circle_at_top_left,_rgba(241,245,249,0.6),_transparent_70%)]">
        {children}
      </div>
    </div>
  );
}

function FakeMainContent({ label }: { label: string }) {
  return (
    <div className="hidden flex-1 flex-col gap-3 p-6 text-slate-400 lg:flex">
      <div className="text-[11px] font-medium uppercase tracking-wider">
        Page content
      </div>
      <div className="h-7 w-1/3 rounded bg-slate-100" />
      <div className="h-3 w-2/3 rounded bg-slate-100" />
      <div className="h-3 w-1/2 rounded bg-slate-100" />
      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="h-24 rounded-xl bg-slate-100/70" />
        <div className="h-24 rounded-xl bg-slate-100/70" />
      </div>
      <div className="mt-auto text-[11px] text-slate-300">{label}</div>
    </div>
  );
}

export default function SidebarPreviewPage() {
  // After the V2 rollout, `leadSmartNav` already ships with lucide icons
  // and supercategory section-labels — no transform needed. The legacy
  // `PremiumSidebar` silently ignores section-labels (see PremiumSidebar.tsx).
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100/70 text-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/80 px-6 py-5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
            Design proposal · Phase 1 + structural
          </div>
          <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
            Sidebar redesign — LeadSmart Agent Portal
          </h1>
          <p className="max-w-3xl text-[13.5px] leading-relaxed text-slate-600">
            Side-by-side comparison of today's <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px] text-slate-700">PremiumSidebar</code>{" "}
            and the proposed{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px] text-slate-700">PremiumSidebarV2</code>.
            Both render the live <code className="rounded bg-slate-100 px-1 py-0.5 text-[12px] text-slate-700">leadSmartNav</code>; the V2 sidebar
            runs through a presentation transform that swaps emoji glyphs for lucide icons and buckets the ten groups into four supercategories.
            No production code paths are touched.
          </p>
        </div>
      </header>

      {/* Mobile note */}
      <div className="mx-auto max-w-[1480px] px-6 py-6 lg:hidden">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13px] text-amber-900">
          The sidebar comparison is desktop-only (lg breakpoint and up). Open this page on a wider viewport to see the side-by-side.
        </div>
      </div>

      {/* Side-by-side */}
      <div className="mx-auto hidden max-w-[1480px] grid-cols-1 gap-6 px-6 py-6 lg:grid lg:grid-cols-2">
        <PreviewFrame title="Current" tone="current">
          <PremiumSidebar
            appName="CloseBoss"
            sections={leadSmartNav}
            workspaceLabel="Agent portal"
            height="stretch"
          />
          <FakeMainContent label="↑ Live leadSmartNav — emoji icons, 10 flat groups" />
        </PreviewFrame>

        <PreviewFrame title="Proposed" tone="proposed">
          <PremiumSidebarV2
            appName="CloseBoss"
            sections={leadSmartNav}
            workspaceLabel="Agent portal · Pacific"
            onSearchClick={() => {
              // Preview-only no-op; wire to existing CommandPalette on rollout.
              if (typeof window !== "undefined") {
                window.alert("Cmd-K trigger — wire to existing CommandPalette on rollout.");
              }
            }}
            user={PREVIEW_USER}
            onLogout={() => {
              if (typeof window !== "undefined") {
                window.alert("Logout — wire to Supabase signOut on rollout.");
              }
            }}
            height="stretch"
          />
          <FakeMainContent label="↑ Same nav, after iconography + supercategory transform" />
        </PreviewFrame>
      </div>

      {/* Annotated change list */}
      <div className="mx-auto hidden max-w-[1480px] grid-cols-2 gap-6 px-6 pb-12 lg:grid">
        <div />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            What changed
          </div>
          <ul className="space-y-2.5 text-[13px] leading-relaxed text-slate-700">
            <li className="flex gap-2">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <span className="font-semibold">One icon family.</span> Emoji glyphs (🏠 👥 ✅) replaced with lucide at uniform 1.75 stroke — 17px parents, 14px leaves.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <span className="font-semibold">Supercategories.</span> Ten flat groups bucketed under <em>Work</em>, <em>Engage</em>, <em>Analyze</em>, <em>Manage</em>. "Home" pinned above.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <span className="font-semibold">Quiet active state.</span> Soft <code className="rounded bg-slate-100 px-1 text-[12px]">bg-slate-100</code> fill + 2px emerald left rail replaces the heavy black pill.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <span className="font-semibold">Workspace switcher.</span> Initials tile + chevron in the header sets up multi-workspace and reads as premium immediately.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <span className="font-semibold">Cmd-K trigger row.</span> Persistent search affordance — surfaces the keyboard shortcut every user has but few discover.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <span className="font-semibold">User identity card.</span> Avatar, plan badge, settings + logout in the footer — replaces the copyright line.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <span className="font-semibold">Typed badges.</span> Counts (digits) → slate pill, dots (<code className="rounded bg-slate-100 px-1 text-[12px]">•</code>) → emerald dot, labels (text) → emerald label pill. See <em>Lead Queue 12</em>, <em>Offers 3</em>, <em>Generate Leads NEW</em>, <em>Admin •</em>.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span>
                <span className="font-semibold">Density discipline.</span> Group rows <code className="rounded bg-slate-100 px-1 text-[12px]">font-semibold</code>, leaves <code className="rounded bg-slate-100 px-1 text-[12px]">font-normal</code> — three-layer hierarchy restored.
              </span>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
