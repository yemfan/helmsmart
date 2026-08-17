"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import {
  createTeam,
  inviteMember,
  removeMember,
  revokeInvite,
} from "@/app/dashboard/team/actions";
import type { TeamAccessStatus } from "@/lib/teams/access.server";
import { TeamBreakdownPanel } from "./TeamBreakdownPanel";
import type { TeamInvite, TeamMembership, TeamRoster } from "@/lib/teams/types";

type SeatUsageProps = { used: number; cap: number | null; full: boolean };

/**
 * Team management surface.
 *
 * Two states:
 *   - No team yet → "Create team" form
 *   - Team exists → roster + invite form (owner) or read-only roster (member)
 *
 * Invite flow is intentionally manual for MVP: the server returns
 * the raw token; the UI shows the accept link for the owner to
 * copy/share. Email-send for invites layers in a follow-up PR.
 */
export function TeamDashboard({
  currentAgentId,
  isOwner,
  roster,
  access,
  seatUsage,
}: {
  currentAgentId: string;
  isOwner: boolean;
  roster: TeamRoster | null;
  access: TeamAccessStatus;
  seatUsage: SeatUsageProps | null;
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
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">{t("pages.team.member")}</span>
        )}
      </header>

      {isOwner && seatUsage ? <SeatUsageBanner usage={seatUsage} /> : null}

      <RosterCard
        teamId={roster.team.id}
        currentAgentId={currentAgentId}
        isOwner={isOwner}
        members={roster.members}
      />

      <TeamBreakdownPanel teamId={roster.team.id} />

      {isOwner ? (
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
          {isPlanIssue ? "Upgrade to start a team" : "Subscription not found"}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-slate-600">
          {isPlanIssue ? (
            <>
              {t("pages.team.requiresBefore")} <strong>Elite</strong>{t("pages.team.requiresAfter")}
            </>
          ) : (
            "We couldn't find an active subscription for your account. Reach out to support if this looks wrong."
          )}
        </p>
      </header>
      <div className="mt-5">
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {isPlanIssue ? "View plans" : "Manage billing"}
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
          {pending ? "Creating…" : "Create team"}
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
}: {
  teamId: string;
  currentAgentId: string;
  isOwner: boolean;
  members: TeamMembership[];
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
              <p className="truncate text-sm font-medium text-slate-900">{t("pages.dashFragments.agentWord")} {shortenId(m.agentId)}
                {m.agentId === currentAgentId ? (
                  <span className="ml-2 text-xs text-slate-500">(you)</span>
                ) : null}
              </p>
              <p className="text-xs text-slate-500 capitalize">{m.role}</p>
            </div>
            {isOwner && m.role !== "owner" ? (
              <RemoveMemberButton teamId={teamId} agentId={m.agentId} />
            ) : null}
          </li>
        ))}
      </ul>
    </section>
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
          {pending ? "Sending…" : "Generate invite link"}
        </button>
      </form>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {lastInvite ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="font-medium text-emerald-800">{t("pages.dashFragments.inviteFor")} {lastInvite.email} ready
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
                    {t("pages.team.expires", { date: new Date(inv.expiresAt).toLocaleDateString(intlLocale(i18n.language)) })}
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
