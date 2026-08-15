"use client";

import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { getAssistant } from "@/lib/realtyboss/team";
import { AssistantHeader, AssistantKpiCard } from "@/components/realtyboss/AssistantPage";
import { AssistantCallSettings } from "@/components/realtyboss/AssistantCallSettings";
import WeeklySocialPosts, {
  type SocialMode,
  type SocialRec,
} from "@/components/marketing/WeeklySocialPosts";
import PostQueue from "@/components/marketing/PostQueue";
import ClientNewsletterCard from "@/components/marketing/ClientNewsletterCard";
import AdPhotoPanel from "@/components/marketing/AdPhotoPanel";
import ReelTestPanel from "@/components/marketing/ReelTestPanel";
import VideoEditorPanel from "@/components/marketing/VideoEditorPanel";

/**
 * Marketing Assistant overview — demand generation. Took over from
 * the Sales Assistant: it CREATES leads and keeps the Realtor visible
 * (social posts, marketing plans, sphere nurture, lead-gen tools);
 * the Sales Assistant converts what it produces.
 */

export type MarketingData = {
  postsScheduled: number;
  postsPublished30d: number;
  plansActive: number;
  templates: number;
  newLeadsThisMonth: number;
  upcomingPosts: {
    id: string;
    platform: string;
    caption: string | null;
    scheduled_for: string;
    status: string;
  }[];
  activities: {
    id: string;
    activity_type: string;
    summary: string;
    outcome: string | null;
    created_at: string;
    requires_attention: boolean;
  }[];
};

const assistant = getAssistant("marketing_assistant");

function fmtWhen(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export type SocialData = {
  weekOf: string;
  mode: SocialMode;
  recs: SocialRec[];
  /** Human-facing labels of the agent's connected social platforms (e.g. ["Facebook"]). */
  connectedPlatforms: string[];
  /** Signature-tier: unlocks "bring your own image" + brand kit. */
  canCustomize: boolean;
};

export type ClientNewsletter = {
  shareUrl: string;
  subscriberCount: number;
  agentName: string | null;
} | null;

export default function MarketingAssistantClient({
  data,
  social,
  newsletter,
}: {
  data: MarketingData;
  social: SocialData;
  newsletter?: ClientNewsletter;
}) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  return (
    <div className="space-y-4">
      <AssistantHeader
        assistant={assistant}
        actions={[
          { label: t("assistants.marketing.tabs.drafts"), href: "/dashboard/drafts" },
          { label: t("assistants.marketing.tabs.plans"), href: "/dashboard/marketing/plans" },
          { label: t("assistants.marketing.tabs.templates"), href: "/dashboard/templates" },
          { label: t("assistants.marketing.tabs.generateLeads"), href: "/dashboard/leads/generate" },
          { label: t("assistants.common.manage"), href: "/dashboard/ai-team" },
        ]}
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <AssistantKpiCard label={t("assistants.marketing.stats.scheduled")} value={data.postsScheduled} />
        <AssistantKpiCard label={t("assistants.marketing.stats.published")} value={data.postsPublished30d} hint={t("assistants.marketing.hints.last30")} />
        <AssistantKpiCard label={t("assistants.marketing.stats.plansRunning")} value={data.plansActive} />
        <AssistantKpiCard label={t("assistants.marketing.stats.newLeads")} value={data.newLeadsThisMonth} />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setKnowledgeOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          aria-expanded={knowledgeOpen}
        >
          <BookOpen className="h-3.5 w-3.5" strokeWidth={2} />
          Brand &amp; knowledge
          {knowledgeOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {knowledgeOpen && (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 text-sm font-semibold text-gray-900">
            Your Marketing Assistant&apos;s knowledge base
          </h2>
          <p className="mb-4 text-xs text-gray-500">
            Grounds everything it writes — post captions, plans, nurture copy. Its own brief,
            separate from your Receptionist&apos;s and Sales Assistant&apos;s.
          </p>
          <AssistantCallSettings
            type="marketing_assistant"
            showName={false}
            knowledgePlaceholder="Service areas, your specialties and niches, brand taglines, what makes you different, standing facts to weave into posts…"
            knowledgeHint="Facts your Marketing Assistant may use in post and nurture copy. It only uses what's relevant per post and never invents beyond it."
          />
        </section>
      )}

      {/* This week's social posts — content database → weekly recommendations */}
      <WeeklySocialPosts
        initialRecs={social.recs}
        initialMode={social.mode}
        weekOf={social.weekOf}
        connectedPlatforms={social.connectedPlatforms}
        canCustomize={social.canCustomize}
      />

      {/* Advanced — power-user customization, collapsed by default so the auto-
          rotating curated posts above stay the focus for busy agents. */}
      <details className="group rounded-xl border border-gray-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{t("assistants.marketing.advanced")}</h3>
            <p className="mt-0.5 text-sm text-gray-500">
              Custom ad designer, brand photos, and video reels — optional. Your assistant
              posts curated designs automatically without any of this.
            </p>
          </div>
          <span className="shrink-0 text-gray-400 transition group-open:rotate-180" aria-hidden>
            ▾
          </span>
        </summary>

        <div className="space-y-5 border-t border-gray-100 p-5">
          {/* Ad Composer entry — design a custom branded ad from a template */}
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-5">
            <div>
              <h3 className="text-base font-semibold text-gray-900">{t("assistants.marketing.customAd")}</h3>
              <p className="mt-0.5 text-sm text-gray-500">
                Pick a template + theme, edit the copy, preview live, then save or schedule.
              </p>
            </div>
            <Link
              href="/dashboard/ai-marketing-assistant/ad-composer"
              className="shrink-0 rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#005ba8]"
            >
              Open Ad Composer →
            </Link>
          </section>

          {/* Brand photo pool → the Marketing Assistant rotates uploads into photo ads */}
          <AdPhotoPanel canCustomize={social.canCustomize} />

          {/* Manual video-reel smoke test — render, preview, then publish on demand */}
          <ReelTestPanel canCustomize={social.canCustomize} />

          {/* Video editor — upload a clip → branded vertical reel → publish queue */}
          <VideoEditorPanel canCustomize={social.canCustomize} />
        </div>
      </details>

      {/* The queue: what's about to publish, and (in review mode) the gate that
          holds it until a human approves. Reads scheduled_posts, so it also
          covers posts queued by hand from the cards above. */}
      <PostQueue />

      {/* Your Client Newsletter — agent-branded weekly briefing signup link */}
      {newsletter && (
        <ClientNewsletterCard
          shareUrl={newsletter.shareUrl}
          subscriberCount={newsletter.subscriberCount}
          agentName={newsletter.agentName}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Publishing calendar */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">{t("assistants.marketing.comingUp")}</h2>
            <Link
              href="/dashboard/leads/generate"
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Open scheduler
            </Link>
          </div>
          {data.upcomingPosts.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              Nothing scheduled — a quiet calendar means a quiet pipeline.{" "}
              <Link href="/dashboard/leads/generate" className="text-blue-600 hover:underline">
                Schedule a post
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-2">
              {data.upcomingPosts.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-900">
                      {p.caption?.trim() || "(no caption)"}
                    </p>
                    <p className="text-xs capitalize text-gray-500">{p.platform}</p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{fmtWhen(p.scheduled_for, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* What it's been doing */}
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">{t("assistants.marketing.latestActivity")}</h2>
          {data.activities.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              No activity yet. Once your Marketing Assistant starts publishing and nurturing, its
              work shows up here.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.activities.map((a) => (
                <li key={a.id} className="rounded-lg border border-gray-100 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-gray-900">{a.summary}</p>
                    <span className="shrink-0 text-xs text-gray-400">{fmtWhen(a.created_at, locale)}</span>
                  </div>
                  {a.outcome && <p className="text-xs text-gray-500">{a.outcome}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Hand-off note — constitution: a team, with clear lanes */}
      <p className="text-xs text-gray-400">
        Your Marketing Assistant creates demand; leads it generates are handed to your{" "}
        <Link href="/dashboard/ai-sales-assistant" className="text-gray-500 underline-offset-2 hover:underline">
          Sales Assistant
        </Link>{" "}
        to convert.
      </p>
    </div>
  );
}
