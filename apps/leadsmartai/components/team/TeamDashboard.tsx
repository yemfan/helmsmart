"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import {
  createTeam,
  inviteMember,
  removeMember,
  revokeInvite,
  setRole,
} from "@/app/dashboard/team/actions";
import type { TeamAccessStatus } from "@/lib/teams/access.server";
import { TeamBreakdownPanel } from "./TeamBreakdownPanel";
import type { TeamInvite, TeamMembership, TeamRoster } from "@/lib/teams/types";
import type { OnboardingBoard } from "@/lib/teams/onboarding.server";
import { OnboardingBoardCard, RosterImportCard } from "./OnboardingPanels";
import { TeamPerformancePanel } from "./TeamPerformancePanel";
import { TeamScorecardPanel } from "./TeamScorecardPanel";
import { TeamMarketingPanel } from "./TeamMarketingPanel";
import { TeamRetentionPanel } from "./TeamRetentionPanel";
import { TeamCompliancePanel } from "./TeamCompliancePanel";
import { BrokerageBrandCard } from "./BrokerageBrandCard";
import type { TeamBrand } from "@/lib/teams/brand";
import type { MemberDirectory } from "@/lib/teams/directory.server";
import type { LibraryItem } from "@/lib/teams/library";
import { TeamLibraryPanel } from "./TeamLibraryPanel";
import type { Referral } from "@/lib/teams/referrals";
import { TeamReferralsPanel } from "./TeamReferralsPanel";
import type { AgentLicense } from "@/lib/teams/license";
import { LicenseForm } from "./LicenseForm";
import type { Announcement } from "@/lib/teams/billboard";
import { BillboardPanel } from "./BillboardPanel";
import type { BoardPost } from "@/lib/teams/board";
import { OfficeBoardPanel } from "./OfficeBoardPanel";

type SeatUsageProps = { used: number; cap: number | null; full: boolean };

/**
 * Team management surface.
 *
 * Two states:
 *   - No team yet → t("dashboard:pages.teamDashboard.createTeam") form
 *   - Team exists → roster + invite form (owner) or read-only roster (member)
 *
 * Invite flow is intentionally manual for MVP: the server returns
 * the raw token; the UI shows the accept link for the owner to
 * copy/share. Email-send for invites layers in a follow-up PR.
 */
export function TeamDashboard({
  currentAgentId,
  isOwner,
  canManage = isOwner,
  roster,
  access,
  seatUsage,
  board,
  brand,
  directory = {},
  library = [],
  referrals = [],
  myLicense = null,
  billboard = [],
  board_posts = [],
}: {
  currentAgentId: string;
  isOwner: boolean;
  /** Owner or manager: may run onboarding (invite, import, board, brand). */
  canManage?: boolean;
  roster: TeamRoster | null;
  access: TeamAccessStatus;
  seatUsage: SeatUsageProps | null;
  /** Owner only: where every agent is in onboarding. */
  board?: OnboardingBoard | null;
  /** Owner only: the brokerage brand shown on member hubs. */
  brand?: TeamBrand | null;
  /** Everyone: the brokerage content library. */
  library?: LibraryItem[];
  /** Everyone: referrals they are part of; managers: the whole office. */
  referrals?: Referral[];
  /** The caller's own license; null means the brokerage is still waiting for it. */
  myLicense?: AgentLicense | null;
  /** Everyone: the brokerage billboard, live posts only. */
  billboard?: Announcement[];
  /** Everyone: the office board, newest first. */
  board_posts?: BoardPost[];
  /** Names and emails by agent id, for the lists. */
  directory?: MemberDirectory;
}) {
  const { t } = useTranslation("dashboard");
  if (!roster) {
    return access.canCreate ? (
      <CreateTeamCard />
    ) : (
      <UpgradeRequiredCard reason={access.reason} />
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{t("pages.team.title")}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">
            {roster.team.name}
          </h1>
        </div>
        {isOwner ? (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">{t("pages.team.owner")}</span>
        ) : canManage ? (
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">{t("pages.team.manager")}</span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">{t("pages.team.member")}</span>
        )}
      </header>

      {canManage && seatUsage ? <SeatUsageBanner usage={seatUsage} /> : null}

      {!myLicense ? (
        <section className="rounded-2xl border border-amber-200 bg-white p-6 ring-1 ring-amber-900/[0.06] shadow-sm dark:border-amber-900 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("pages.teamLicense.cardTitle")}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{t("pages.teamLicense.cardIntro", { brokerage: brand?.name ?? roster.team.name })}</p>
          <div className="mt-4">
            <LicenseForm initial={null} required />
          </div>
        </section>
      ) : null}

      <BillboardPanel teamId={roster.team.id} currentAgentId={currentAgentId} canManage={canManage} members={roster.members} directory={directory} initial={billboard} />

      <RosterCard
        teamId={roster.team.id}
        currentAgentId={currentAgentId}
        isOwner={isOwner}
        members={roster.members}
        directory={directory}
      />

      <TeamScorecardPanel teamId={roster.team.id} directory={directory} />

      <TeamPerformancePanel teamId={roster.team.id} />

      {canManage ? <TeamMarketingPanel teamId={roster.team.id} /> : null}

      {canManage ? <TeamRetentionPanel teamId={roster.team.id} /> : null}

      {canManage ? <TeamCompliancePanel teamId={roster.team.id} /> : null}

      {canManage && board ? <OnboardingBoardCard teamId={roster.team.id} board={board} /> : null}

      <TeamBreakdownPanel teamId={roster.team.id} directory={directory} />

      <TeamLibraryPanel teamId={roster.team.id} initial={library} canManage={canManage} directory={directory} />

      <TeamReferralsPanel teamId={roster.team.id} currentAgentId={currentAgentId} canManage={canManage} members={roster.members} directory={directory} initial={referrals} />

      <OfficeBoardPanel teamId={roster.team.id} currentAgentId={currentAgentId} canManage={canManage} directory={directory} initial={board_posts} />

      {canManage ? <BrokerageBrandCard teamId={roster.team.id} brand={brand ?? null} /> : null}

      {canManage ? <RosterImportCard teamId={roster.team.id} /> : null}

      {canManage ? (
        <InviteCard teamId={roster.team.id} pendingInvites={roster.pendingInvites} />
      ) : null}
    </div>
  );
}

// ── Seat usage banner ───────────────────────────────────────────

function SeatUsageBanner({ usage }: { usage: SeatUsageProps }) {
  const { t } = useTranslation("dashboard");
  const capLabel = usage.cap == null ? "∞" : String(usage.cap);
  const ratio =
    usage.cap == null || usage.cap === 0 ? 0 : Math.min(1, usage.used / usage.cap);
  const pct = Math.round(ratio * 100);
  const tone = usage.full
    ? "border-amber-200 bg-amber-50 text-amber-900"
    : pct >= 80
      ? "border-amber-200 bg-amber-50/60 text-amber-900"
      : "border-slate-200 bg-slate-50 text-slate-800";
  const barColor = usage.full
    ? "bg-amber-500"
    : pct >= 80
      ? "bg-amber-400"
      : "bg-blue-500";

  return (
    <div
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-sm ${tone}`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-medium tabular-nums">
          {usage.used} of {capLabel} {t("pages.dashFragments.seatsUsed")}</p>
        {usage.cap != null ? (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/70 ring-1 ring-inset ring-black/[0.04]">
            <div
              className={`h-full rounded-full ${barColor}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
      </div>
      {usage.full ? (
        <Link
          href="/dashboard/billing"
          className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
        >{t("pages.team.requestSeats")}</Link>
      ) : null}
    </div>
  );
}

// ── Upgrade-required state for non-Elite plans ───────────────────

function UpgradeRequiredCard({
  reason,
}: {
  reason: TeamAccessStatus["reason"];
}) {
  const { t } = useTranslation("dashboard");
  const isPlanIssue = reason === "team_access_not_enabled";
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{t("pages.team.teamFeature")}</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">
          {isPlanIssue ? t("pages.teamDashboard.upgradeToStartA") : t("pages.teamDashboard.subscriptionNotFound")}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600">
          {isPlanIssue ? (
            <>
              {t("pages.team.requiresBefore")} <strong>{t("pages.team.requiresPlan")}</strong> {t("pages.team.requiresAfter")}
            </>
          ) : (
            t("pages.teamDashboard.weCouldnTFind")
          )}
        </p>
      </header>
      <div className="mt-5">
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {isPlanIssue ? t("pages.teamDashboard.viewPlans") : t("pages.teamDashboard.manageBilling")}
        </Link>
      </div>
    </section>
  );
}

// ── Create team ──────────────────────────────────────────────────

function CreateTeamCard() {
  const { t } = useTranslation("dashboard");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">{t("pages.team.createTeam")}</h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600">{t("pages.team.createSub")}</p>
      </header>
      <form
        className="mt-5 flex flex-wrap items-center gap-3"
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const r = await createTeam(formData);
            if (!r.ok) setError(r.error);
          });
        }}
      >
        <input
          type="text"
          name="name"
          required
          maxLength={80}
          placeholder={t("pages.team.namePlaceholder")}
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? t("common:status.creating") : t("pages.teamDashboard.createTeam")}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </section>
  );
}

// ── Roster ───────────────────────────────────────────────────────

function RosterCard({
  teamId,
  currentAgentId,
  isOwner,
  members,
  directory = {},
}: {
  teamId: string;
  currentAgentId: string;
  isOwner: boolean;
  members: TeamMembership[];
  directory?: MemberDirectory;
}) {
  const { t } = useTranslation("dashboard");
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{t("pages.team.members")}<span className="text-slate-400">· {members.length}</span>
      </h2>
      <ul className="mt-3 divide-y divide-slate-100">
        {members.map((m) => (
          <li key={m.agentId} className="flex items-center gap-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
              {m.role === "owner" ? "★" : "●"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{directory[m.agentId]?.name ?? directory[m.agentId]?.email ?? `${t("pages.dashFragments.agentWord")} ${shortenId(m.agentId)}`}
                {m.agentId === currentAgentId ? (
                  <span className="ml-2 text-xs text-slate-500">{t("pages.team.you")}</span>
                ) : null}
              </p>
              <p className="text-xs text-slate-500">{t(`pages.team.${m.role === "owner" ? "owner" : m.role === "manager" ? "manager" : "member"}`)}</p>
            </div>
            {isOwner && m.role !== "owner" ? <RoleButton teamId={teamId} agentId={m.agentId} role={m.role} /> : null}
            {isOwner && m.role !== "owner" ? (
              <RemoveMemberButton teamId={teamId} agentId={m.agentId} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function RoleButton({ teamId, agentId, role }: { teamId: string; agentId: string; role: string }) {
  const { t } = useTranslation("dashboard");
  const [pending, startTransition] = useTransition();
  const next = role === "manager" ? "member" : "manager";
  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await setRole(fd);
        });
      }}
    >
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="agentId" value={agentId} />
      <input type="hidden" name="role" value={next} />
      <button type="submit" disabled={pending} className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-60">
        {next === "manager" ? t("pages.team.makeManager") : t("pages.team.makeMember")}
      </button>
    </form>
  );
}

function RemoveMemberButton({ teamId, agentId }: { teamId: string; agentId: string }) {
  const { t } = useTranslation("dashboard");
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await removeMember(fd);
        });
      }}
    >
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="agentId" value={agentId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
      >{t("pages.team.remove")}</button>
    </form>
  );
}

// ── Invites ──────────────────────────────────────────────────────

function InviteCard({
  teamId,
  pendingInvites,
}: {
  teamId: string;
  pendingInvites: TeamInvite[];
}) {
  const { t, i18n } = useTranslation("dashboard");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [lastInvite, setLastInvite] = useState<{
    email: string;
    rawToken: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 ring-1 ring-slate-900/[0.04] shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">{t("pages.team.invite")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("pages.team.inviteSub")}</p>
      <form
        className="mt-4 flex flex-wrap items-center gap-3"
        action={(formData) => {
          setError(null);
          startTransition(async () => {
            const r = await inviteMember(formData);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            const email = String(formData.get("email") ?? "");
            setLastInvite({ email, rawToken: r.rawToken });
            (document.getElementById("invite-email-input") as HTMLInputElement | null)?.value &&
              ((document.getElementById("invite-email-input") as HTMLInputElement).value = "");
          });
        }}
      >
        <input type="hidden" name="teamId" value={teamId} />
        <input
          id="invite-email-input"
          type="email"
          name="email"
          required
          placeholder="agent@example.com"
          className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {pending ? t("common:status.sending") : t("pages.teamDashboard.generateInviteLink")}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {lastInvite ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-800">{t("pages.teamDashboard.inviteReady", { email: lastInvite.email })}
          </p>
          <p className="mt-1 text-xs text-emerald-700">{t("pages.team.copyLink")}</p>
          <code className="mt-2 block break-all rounded bg-white px-2 py-1.5 text-[11px] text-emerald-900 ring-1 ring-emerald-200">
            {acceptUrl(lastInvite.rawToken)}
          </code>
        </div>
      ) : null}

      {pendingInvites.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t("pages.team.pendingInvites")}</h3>
          <ul className="mt-2 divide-y divide-slate-100">
            {pendingInvites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-800">{inv.invitedEmail}</p>
                  <p className="text-xs text-slate-500">
                    {mounted ? t("pages.team.expires", { date: new Date(inv.expiresAt).toLocaleDateString(intlLocale(i18n.language)) }) : null}
                  </p>
                </div>
                <RevokeInviteButton teamId={teamId} inviteId={inv.id} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function RevokeInviteButton({ teamId, inviteId }: { teamId: string; inviteId: string }) {
  const { t } = useTranslation("dashboard");
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await revokeInvite(fd);
        });
      }}
    >
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="inviteId" value={inviteId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
      >{t("pages.team.revoke")}</button>
    </form>
  );
}

// ── helpers ──────────────────────────────────────────────────────

function shortenId(id: string): string {
  if (id.length <= 8) return id;
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function acceptUrl(token: string): string {
  if (typeof window === "undefined") return `/team/accept/${token}`;
  return `${window.location.origin}/team/accept/${token}`;
}
