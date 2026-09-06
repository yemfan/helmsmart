"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";

/**
 * Lead Ad campaign wizard. Single-page, four sections:
 *
 *   1. Where it runs   — connection + ad account
 *   2. Who sees it     — geo + age range
 *   3. What it says    — body + headline + image + lead form
 *   4. Budget + launch — daily $ + duration + launch-immediately
 *
 * Each section gates the next: section 2 won't render until a
 * connection + ad account are picked, etc. Keeps the page short on
 * the agent's first pass and avoids the "tell me everything before
 * I let you click anything" anti-pattern.
 *
 * Submit posts to /api/leads-gen/ads/create which orchestrates 6
 * Meta API calls. Default is to create PAUSED so the agent can do
 * a final review in Meta Ads Manager before money starts moving.
 *
 * Deep-link via `?connectionId=...&subjectAddress=...` from a
 * future "Run Ads on this listing" affordance — for now the
 * params are unused; the wizard works from a cold start.
 */

type Connection = {
  id: string;
  platform: "meta";
  fbPageId: string | null;
  fbPageName: string | null;
  igBusinessUsername: string | null;
  pictureUrl: string | null;
  canPublishFacebook: boolean;
  canPublishInstagram: boolean;
};

type AdAccount = {
  id: string; // 'act_<digits>'
  accountId: string;
  name: string | null;
  currency: string | null;
  isActive: boolean;
};

type MediaItem = {
  id: string;
  signedUrl: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
};

type FormQuestion =
  | "FULL_NAME"
  | "FIRST_NAME"
  | "LAST_NAME"
  | "EMAIL"
  | "PHONE"
  | "STREET_ADDRESS"
  | "CITY"
  | "STATE"
  | "ZIP_CODE";

const FORM_QUESTION_LABELS: Record<FormQuestion, string> = {
  FULL_NAME: "Full name",
  FIRST_NAME: "First name",
  LAST_NAME: "Last name",
  EMAIL: "Email",
  PHONE: "Phone number",
  STREET_ADDRESS: "Street address",
  CITY: "City",
  STATE: "State",
  ZIP_CODE: "ZIP code",
};

const DEFAULT_QUESTIONS: FormQuestion[] = ["FULL_NAME", "EMAIL", "PHONE"];

type LaunchResult = {
  campaignId: string;
  meta: {
    campaignId: string;
    adSetId: string;
    creativeId: string;
    adId: string;
    formId: string;
  };
  status: "paused" | "active";
};

export default function AdCampaignWizardClient() {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Connection + ad account ──────────────────────────────────────
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState(true);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [adAccountsLoading, setAdAccountsLoading] = useState(false);
  const [adAccountId, setAdAccountId] = useState<string | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  // ── Audience ─────────────────────────────────────────────────────
  const [zipCodes, setZipCodes] = useState("");
  const [radiusMiles, setRadiusMiles] = useState(15);
  const [ageMin, setAgeMin] = useState(25);
  const [ageMax, setAgeMax] = useState(65);

  // ── Creative ─────────────────────────────────────────────────────
  const [campaignName, setCampaignName] = useState("");
  const [adBody, setAdBody] = useState("");
  const [adHeadline, setAdHeadline] = useState("");
  const [landingUrl, setLandingUrl] = useState("https://www.closebossai.com/contact");
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<FormQuestion[]>(DEFAULT_QUESTIONS);
  // Per-campaign privacy policy URL override. Starts from the agent's
  // stored default (loaded via /api/dashboard/branding) but the agent
  // can override per-campaign in the UI.
  const [privacyPolicyUrl, setPrivacyPolicyUrl] = useState("");
  const [privacyDefaultLoaded, setPrivacyDefaultLoaded] = useState(false);

  // AI-suggest state — wraps /api/leads-gen/ads/suggest. Stores variants
  // so the agent can cycle "try a different angle".
  const [suggestBrief, setSuggestBrief] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestVariants, setSuggestVariants] = useState<
    Array<{ body: string; headline: string }>
  >([]);
  const [suggestVariantIndex, setSuggestVariantIndex] = useState(0);

  // Audience-estimate state — calls /api/leads-gen/ads/audience-estimate
  // whenever ad account + targeting change. Debounced lightly via the
  // useEffect dependencies; explicit refresh button is also available.
  const [audienceEstimate, setAudienceEstimate] = useState<
    | { lower: number | null; upper: number | null; ready: boolean }
    | null
  >(null);
  const [audienceEstimateLoading, setAudienceEstimateLoading] = useState(false);
  const [audienceEstimateError, setAudienceEstimateError] = useState<
    string | null
  >(null);

  // ── Budget + schedule ────────────────────────────────────────────
  const [dailyBudget, setDailyBudget] = useState(20);
  const [durationDays, setDurationDays] = useState(7);
  const [launchImmediately, setLaunchImmediately] = useState(false);

  // ── Submit ───────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LaunchResult | null>(null);

  // Selected derived state
  const connection = useMemo(
    () => connections.find((c) => c.id === connectionId) ?? null,
    [connections, connectionId],
  );
  const adAccount = useMemo(
    () => adAccounts.find((a) => a.id === adAccountId) ?? null,
    [adAccounts, adAccountId],
  );
  const selectedMedia = useMemo(
    () => library.find((m) => m.id === selectedMediaId) ?? null,
    [library, selectedMediaId],
  );

  // Load connections + library once on mount.
  useEffect(() => {
    let cancelled = false;
    setConnectionsLoading(true);
    fetch("/api/leads-gen/connections")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          connections?: Connection[];
        };
        if (cancelled) return;
        if (body.ok && Array.isArray(body.connections)) {
          const meta = body.connections.filter((c) => c.platform === "meta");
          setConnections(meta);
          // Auto-pick if there's exactly one connection, or honor
          // the deep-link param.
          const fromQuery = (searchParams?.get("connectionId") ?? "").trim();
          const only = meta[0];
          if (fromQuery && meta.some((c) => c.id === fromQuery)) {
            setConnectionId(fromQuery);
          } else if (meta.length === 1 && only) {
            setConnectionId(only.id);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setConnectionsLoading(false);
      });

    setLibraryLoading(true);
    fetch("/api/leads-gen/media/list")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: MediaItem[];
        };
        if (cancelled) return;
        if (body.ok && Array.isArray(body.items)) {
          setLibrary(body.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLibraryLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load ad accounts when connection changes.
  useEffect(() => {
    if (!connectionId) {
      setAdAccounts([]);
      setAdAccountId(null);
      return;
    }
    let cancelled = false;
    setAdAccountsLoading(true);
    setAccountsError(null);
    setAdAccounts([]);
    setAdAccountId(null);
    fetch(
      `/api/leads-gen/ads/accounts?connectionId=${encodeURIComponent(connectionId)}`,
    )
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          accounts?: AdAccount[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? "Failed to load ad accounts");
        }
        setAdAccounts(body.accounts ?? []);
        const activeOnes = (body.accounts ?? []).filter((a) => a.isActive);
        const onlyActive = activeOnes[0];
        if (activeOnes.length === 1 && onlyActive) {
          setAdAccountId(onlyActive.id);
        }
      })
      .catch((e) => {
        if (!cancelled) setAccountsError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setAdAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId]);

  const toggleQuestion = useCallback((q: FormQuestion) => {
    setQuestions((prev) =>
      prev.includes(q) ? prev.filter((x) => x !== q) : [...prev, q],
    );
  }, []);

  const launch = useCallback(async () => {
    if (!connection || !adAccount || !selectedMedia) return;
    setError(null);
    setSubmitting(true);
    try {
      const zips = zipCodes
        .split(/[,\s]+/)
        .map((z) => z.trim())
        .filter((z) => /^\d{5}$/.test(z));
      const startTime = new Date().toISOString();
      const endTime = new Date(
        Date.now() + durationDays * 24 * 60 * 60 * 1000,
      ).toISOString();

      const res = await fetch("/api/leads-gen/ads/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: connection.id,
          adAccountId: adAccount.id,
          name:
        campaignName.trim() ||
        t("pages.adWizard.defaultName", { date: new Date().toLocaleDateString(locale) }),
          body: adBody,
          headline: adHeadline.trim() || undefined,
          mediaItemId: selectedMedia.id,
          formQuestions: questions,
          landingUrl,
          targeting: {
            countries: ["US"],
            zipCodes: zips.length > 0 ? zips : undefined,
            radiusMiles: zips.length > 0 ? radiusMiles : undefined,
            ageMin,
            ageMax,
          },
          dailyBudgetDollars: dailyBudget,
          startTime,
          endTime,
          launchImmediately,
          privacyPolicyUrl: privacyPolicyUrl.trim() || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        campaignId?: string;
        meta?: LaunchResult["meta"];
        status?: "paused" | "active";
        error?: string;
      };
      if (!res.ok || !body.ok || !body.campaignId || !body.meta || !body.status) {
        setError(body.error ?? "Campaign creation failed");
        return;
      }
      setResult({ campaignId: body.campaignId, meta: body.meta, status: body.status });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Campaign creation failed");
    } finally {
      setSubmitting(false);
    }
  }, [
    connection,
    adAccount,
    selectedMedia,
    zipCodes,
    durationDays,
    campaignName,
    adBody,
    adHeadline,
    questions,
    landingUrl,
    radiusMiles,
    ageMin,
    ageMax,
    dailyBudget,
    launchImmediately,
    privacyPolicyUrl,
  ]);

  // Load the agent's stored default privacy URL so the wizard
  // pre-fills it. Empty default is fine — /ads/create falls back
  // to CloseBoss's bundled URL if both wizard + agent column are
  // empty.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/branding")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          branding?: { leadAdPrivacyPolicyUrl?: string };
        };
        if (cancelled) return;
        if (body.ok && body.branding?.leadAdPrivacyPolicyUrl) {
          setPrivacyPolicyUrl(body.branding.leadAdPrivacyPolicyUrl);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPrivacyDefaultLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // AI-suggest: POST the brief, populate body + headline + variants.
  const runSuggest = useCallback(async () => {
    if (!suggestBrief.trim()) return;
    setSuggestError(null);
    setSuggesting(true);
    try {
      const subjectIdFromQuery = (searchParams?.get("subjectId") ?? "").trim();
      const triggerFromQuery = (searchParams?.get("trigger") ?? "").trim();
      const res = await fetch("/api/leads-gen/ads/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: suggestBrief.trim(),
          subjectId: subjectIdFromQuery || undefined,
          trigger: triggerFromQuery || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        body?: string;
        headline?: string;
        variants?: Array<{ body: string; headline: string }>;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.body || !body.headline) {
        throw new Error(body.error ?? "AI suggest failed");
      }
      const primary = { body: body.body, headline: body.headline };
      const variants = [primary, ...(body.variants ?? [])];
      setSuggestVariants(variants);
      setSuggestVariantIndex(0);
      setAdBody(primary.body);
      setAdHeadline(primary.headline);
    } catch (e) {
      setSuggestError(
        e instanceof Error ? e.message : "AI suggest failed",
      );
    } finally {
      setSuggesting(false);
    }
  }, [suggestBrief, searchParams]);

  const cycleSuggestVariant = useCallback(() => {
    if (suggestVariants.length <= 1) return;
    const next = (suggestVariantIndex + 1) % suggestVariants.length;
    setSuggestVariantIndex(next);
    const v = suggestVariants[next]!;
    setAdBody(v.body);
    setAdHeadline(v.headline);
  }, [suggestVariants, suggestVariantIndex]);

  // Audience-estimate: fire once we have ad account + targeting basics.
  // Debounced via a 600ms timer so live zip-code editing doesn't spam
  // Meta. Skipped entirely when ad account isn't picked yet.
  useEffect(() => {
    if (!connection || !adAccount) {
      setAudienceEstimate(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setAudienceEstimateLoading(true);
      setAudienceEstimateError(null);
      try {
        const zips = zipCodes
          .split(/[,\s]+/)
          .map((z) => z.trim())
          .filter((z) => /^\d{5}$/.test(z));
        const res = await fetch("/api/leads-gen/ads/audience-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectionId: connection.id,
            adAccountId: adAccount.id,
            targeting: {
              countries: ["US"],
              zipCodes: zips.length > 0 ? zips : undefined,
              radiusMiles: zips.length > 0 ? radiusMiles : undefined,
              ageMin,
              ageMax,
            },
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          mauLower?: number | null;
          mauUpper?: number | null;
          estimateReady?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? "Audience estimate failed");
        }
        setAudienceEstimate({
          lower: body.mauLower ?? null,
          upper: body.mauUpper ?? null,
          ready: body.estimateReady ?? false,
        });
      } catch (e) {
        if (!cancelled) {
          setAudienceEstimateError(
            e instanceof Error ? e.message : "Audience estimate failed",
          );
        }
      } finally {
        if (!cancelled) setAudienceEstimateLoading(false);
      }
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [connection, adAccount, zipCodes, radiusMiles, ageMin, ageMax]);

  // Step gating
  const step1Complete = Boolean(connection && adAccount);
  const step2Complete = step1Complete; // audience has defaults — always "complete"
  const step3Complete =
    step2Complete &&
    Boolean(
      campaignName.trim() &&
        adBody.trim() &&
        selectedMedia &&
        questions.length > 0,
    );
  const canLaunch = step3Complete && dailyBudget >= 5 && durationDays >= 1;

  // ── Render ───────────────────────────────────────────────────────

  if (result) {
    return (
      <DoneState
        result={result}
        onAnother={() => {
          setResult(null);
          setError(null);
        }}
        onBack={() => router.push("/dashboard/leads/generate")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t("pages.adWizard.newCampaign")}</h1>
          <p className="text-sm text-slate-500">{t("pages.adWizard.newCampaignSub")}</p>
        </div>
        <Link
          href="/dashboard/leads/generate"
          className="text-sm text-slate-500 hover:text-slate-900"
        >
          &larr; Back
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Section 1 — Where it runs */}
      <Section
        n={1}
        title={t("pages.adWizard.whereItRuns")}
        subtitle={t("pages.adWizard.whereItRunsSub")}
      >
        {connectionsLoading ? (
          <p className="text-sm text-slate-500">{t("pages.adWizard.loadingConnections")}</p>
        ) : connections.length === 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">{t("pages.adWizard.noPages")}{" "}
            <Link
              href="/dashboard/leads/generate/connect"
              className="font-medium underline hover:text-amber-700"
            >
              {t("pages.adWizard.connectAPage")}
            </Link>
          </div>
        ) : (
          <>
            <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.page")}</label>
            <select
              value={connectionId ?? ""}
              onChange={(e) => setConnectionId(e.target.value || null)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">{t("pages.adWizard.pickPage")}</option>
              {connections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fbPageName ?? t("pages.adCampaignWizard.connectedPage")}
                  {c.igBusinessUsername ? ` (+ IG @${c.igBusinessUsername})` : ""}
                </option>
              ))}
            </select>

            {connectionId && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.adAccount")}</label>
                {adAccountsLoading ? (
                  <p className="mt-1 text-sm text-slate-500">{t("pages.adWizard.loadingAdAccounts")}</p>
                ) : accountsError ? (
                  <p className="mt-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {accountsError}
                  </p>
                ) : adAccounts.length === 0 ? (
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("pages.adWizard.noAdAccounts")}</p>
                ) : (
                  <select
                    value={adAccountId ?? ""}
                    onChange={(e) => setAdAccountId(e.target.value || null)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">{t("pages.adWizard.pickAdAccount")}</option>
                    {adAccounts.map((a) => (
                      <option key={a.id} value={a.id} disabled={!a.isActive}>
                        {a.name ?? a.accountId}
                        {a.currency ? ` (${a.currency})` : ""}
                        {!a.isActive ? " — inactive" : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </>
        )}
      </Section>

      {/* Section 2 — Audience */}
      {step1Complete && (
        <Section
          n={2}
          title={t("pages.adWizard.whoSeesIt")}
          subtitle={t("pages.adWizard.whoSeesItSub")}
        >
          <div>
            <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.zips")}</label>
            <textarea
              value={zipCodes}
              onChange={(e) => setZipCodes(e.target.value)}
              rows={2}
              placeholder="90210, 90211, 90212"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <p className="mt-1 text-xs text-slate-500">{t("pages.adWizard.zipsHint")}</p>
          </div>

          {zipCodes.trim() && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-700">
                {t("pages.adWizard.radiusAround", { miles: radiusMiles })}
              </label>
              <input
                type="range"
                min={5}
                max={50}
                step={5}
                value={radiusMiles}
                onChange={(e) => setRadiusMiles(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.minAge")}</label>
              <input
                type="number"
                min={18}
                max={65}
                value={ageMin}
                onChange={(e) =>
                  setAgeMin(Math.max(18, Math.min(65, Number(e.target.value) || 25)))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.maxAge")}</label>
              <input
                type="number"
                min={18}
                max={65}
                value={ageMax}
                onChange={(e) =>
                  setAgeMax(Math.max(18, Math.min(65, Number(e.target.value) || 65)))
                }
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Audience reach preview — live calls Meta's delivery_estimate
              endpoint as the agent edits zips/age. HOUSING category
              restricts targeting, so this is a meaningful gut-check. */}
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/60 px-3 py-2.5 text-xs text-blue-900">
            <div className="flex items-center justify-between">
              <p className="font-semibold">{t("pages.adWizard.audienceSize")}</p>
              {audienceEstimateLoading && (
                <span className="text-[10px] uppercase tracking-wide text-blue-700">
                  {t("pages.adWizard.estimating")}
                </span>
              )}
            </div>
            {audienceEstimateError ? (
              <p className="mt-1 text-red-800">{audienceEstimateError}</p>
            ) : audienceEstimate ? (
              audienceEstimate.lower != null && audienceEstimate.upper != null ? (
                <p className="mt-1">{t("pages.adWizard.approximately")}{" "}
                  <span className="font-semibold">
                    {formatRangeShort(audienceEstimate.lower)} –{" "}
                    {formatRangeShort(audienceEstimate.upper)}
                  </span>{" "}{t("pages.adWizard.peopleMatch")}{" "}
                  {!audienceEstimate.ready && (
                    <span className="text-blue-700">
                      (Initial estimate — Meta refines this as the campaign runs.)
                    </span>
                  )}
                </p>
              ) : (
                <p className="mt-1 text-blue-700">{t("pages.adWizard.noEstimate")}</p>
              )
            ) : (
              <p className="mt-1 text-blue-700">{t("pages.adWizard.pickToEstimate")}</p>
            )}
          </div>
        </Section>
      )}

      {/* Section 3 — Creative + form */}
      {step2Complete && (
        <Section
          n={3}
          title={t("pages.adWizard.whatItSays")}
          subtitle={t("pages.adWizard.whatItSaysSub")}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.campaignName")}<span className="text-slate-400">{t("pages.adWizard.internalLabel")}</span>
              </label>
              <input
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder={t("pages.adWizard.defaultName", { date: new Date().toLocaleDateString(locale) })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.adBody")}</label>
                <button
                  type="button"
                  onClick={() => {
                    setShowSuggest((v) => !v);
                    setSuggestError(null);
                  }}
                  className="text-xs font-medium text-purple-700 hover:text-purple-900"
                >
                  ✨ {showSuggest ? t("pages.adWizard.hide") : t("pages.adWizard.suggestWithAi")}
                </button>
              </div>
              {showSuggest && (
                <div className="mt-1 rounded-lg border border-purple-200 bg-purple-50/60 p-3 space-y-2">
                  <label className="block text-[11px] font-medium text-purple-900">{t("pages.adWizard.brief")}</label>
                  <textarea
                    value={suggestBrief}
                    onChange={(e) => setSuggestBrief(e.target.value)}
                    rows={2}
                    placeholder='e.g. "New listing at 123 Main St, Pasadena CA. 3bd 2ba, $1.2M, modern reno, walk to Old Town."'
                    className="w-full rounded-md border border-purple-200 px-2 py-1 text-xs focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={runSuggest}
                      disabled={suggesting || !suggestBrief.trim()}
                      className="rounded-md bg-purple-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      {suggesting ? t("pages.adWizard.generating") : t("pages.adWizard.generate")}
                    </button>
                    {suggestVariants.length > 1 && (
                      <button
                        type="button"
                        onClick={cycleSuggestVariant}
                        className="rounded-md border border-purple-300 bg-white px-2.5 py-1 text-xs font-medium text-purple-700 hover:bg-purple-50"
                      >
                        {t("pages.adWizard.differentAngle", {
                          n: suggestVariantIndex + 1,
                          total: suggestVariants.length,
                        })}
                      </button>
                    )}
                  </div>
                  {suggestError && (
                    <p className="text-[11px] text-red-700">{suggestError}</p>
                  )}
                </div>
              )}
              <textarea
                value={adBody}
                onChange={(e) => setAdBody(e.target.value)}
                rows={4}
                placeholder={t("pages.adWizard.briefPlaceholder")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.headline")}<span className="text-slate-400">{t("pages.adWizard.headlineLimit")}</span>
              </label>
              <input
                value={adHeadline}
                onChange={(e) => setAdHeadline(e.target.value)}
                placeholder='e.g. "Just listed in Pasadena"'
                maxLength={40}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.landingUrl")}<span className="text-slate-400">{t("pages.adWizard.thankYouHint")}</span>
              </label>
              <input
                value={landingUrl}
                onChange={(e) => setLandingUrl(e.target.value)}
                placeholder={t("pages.adWizard.sitePlaceholder")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.privacyUrl")}{" "}
                <span className="text-slate-400">{t("pages.adWizard.privacyNote")}</span>
              </label>
              <input
                type="url"
                value={privacyPolicyUrl}
                onChange={(e) => setPrivacyPolicyUrl(e.target.value)}
                placeholder={t("pages.adWizard.privacyPlaceholder")}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <p className="mt-1 text-[11px] text-slate-500">{t("pages.adWizard.mustBeHttps")}{" "}
                <a
                  href="/dashboard/settings"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-blue-600 hover:underline"
                >
                  {t("pages.adWizard.settingsBranding")}
                </a>
                .
                {privacyDefaultLoaded &&
                  !privacyPolicyUrl.trim() &&
                  t("pages.adCampaignWizard.usingClosebossSBundled")}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.image")}</label>
              {libraryLoading ? (
                <p className="mt-1 text-sm text-slate-500">{t("pages.adWizard.loadingLibrary")}</p>
              ) : library.length === 0 ? (
                <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{t("pages.adWizard.emptyLibrary")}</p>
              ) : (
                <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {library.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setSelectedMediaId(m.id)}
                      className={`relative aspect-square overflow-hidden rounded-lg border ${
                        selectedMediaId === m.id
                          ? "border-blue-500 ring-2 ring-blue-100"
                          : "border-slate-200 hover:border-blue-300"
                      }`}
                      title={m.fileName ?? "Library image"}
                    >
                      {m.signedUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.signedUrl}
                          alt={m.fileName ?? ""}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-slate-100" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">{t("pages.adWizard.formQuestions")}</label>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">
                Tick the fields you want each lead to fill in. Fewer = higher
                conversion; more = better-qualified leads.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.keys(FORM_QUESTION_LABELS) as FormQuestion[]).map((q) => (
                  <label
                    key={q}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={questions.includes(q)}
                      onChange={() => toggleQuestion(q)}
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    {FORM_QUESTION_LABELS[q]}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* Section 4 — Budget + launch */}
      {step3Complete && (
        <Section
          n={4}
          title={t("pages.adWizard.budgetLaunch")}
          subtitle={t("pages.adWizard.budgetLaunchSub")}
        >
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">
                Daily budget: ${dailyBudget}/day
              </label>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={dailyBudget}
                onChange={(e) => setDailyBudget(Number(e.target.value))}
                className="mt-1 w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>$5</span>
                <span>$100</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">
                {t("pages.adWizard.runForDays", {
                  days: durationDays,
                  unit: t(durationDays === 1 ? "pages.adWizard.dayOne" : "pages.adWizard.dayOther"),
                })}
              </label>
              <input
                type="range"
                min={1}
                max={30}
                step={1}
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="mt-1 w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                <span>1d</span>
                <span>30d</span>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-slate-600">{t("pages.adWizard.totalBudget")}</span>
                <span className="font-semibold text-slate-900">
                  ${dailyBudget * durationDays}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{t("pages.adWizard.metaBills")}</p>
            </div>

            <label className="flex items-start gap-2 rounded-lg border border-slate-200 px-3 py-2.5">
              <input
                type="checkbox"
                checked={launchImmediately}
                onChange={(e) => setLaunchImmediately(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="text-sm">
                <span className="font-medium text-slate-900">{t("pages.adWizard.launchNow")}</span>
                <p className="text-xs text-slate-500">
                  {t("pages.adWizard.pausedBefore")} <strong>{t("pages.adWizard.paused")}</strong> {t("pages.adWizard.pausedAfter")}
                </p>
              </div>
            </label>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
              <Link
                href="/dashboard/leads/generate"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >{t("pages.adWizard.cancel")}</Link>
              <button
                type="button"
                onClick={launch}
                disabled={!canLaunch || submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting
                  ? t("pages.adCampaignWizard.creatingCampaign")
                  : launchImmediately
                    ? t("pages.adCampaignWizard.launchCampaign")
                    : t("pages.adCampaignWizard.createPausedCampaign")}
              </button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({
  n,
  title,
  subtitle,
  children,
}: {
  n: number;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
          {n}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function DoneState({
  result,
  onAnother,
  onBack,
}: {
  result: LaunchResult;
  onAnother: () => void;
  onBack: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const adsManagerUrl = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?selected_campaign_ids=${encodeURIComponent(result.meta.campaignId)}`;
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
          <svg
            className="h-5 w-5 text-emerald-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-emerald-900">{t("pages.adWizard.campaignCreated")}{result.status === "active" ? t("pages.adWizard.andLive") : t("pages.adWizard.andPaused")}
          </h2>
          <p className="text-sm text-emerald-800">
            {result.status === "active"
              ? t("pages.adCampaignWizard.yourMetaLeadAd")
              : t("pages.adCampaignWizard.yourMetaLeadAd")}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-mono text-emerald-900 space-y-0.5">
        <div>
          <span className="text-emerald-700">{t("pages.adWizard.campaign")}</span>{" "}
          {result.meta.campaignId}
        </div>
        <div>
          <span className="text-emerald-700">{t("pages.adWizard.adSet")}</span>{" "}
          {result.meta.adSetId}
        </div>
        <div>
          <span className="text-emerald-700">Ad</span> {result.meta.adId}
        </div>
        <div>
          <span className="text-emerald-700">{t("pages.adWizard.leadForm")}</span>{" "}
          {result.meta.formId}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={adsManagerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          {t("pages.adWizard.openMetaAdsManager")}
        </a>
        <button
          type="button"
          onClick={onAnother}
          className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
        >{t("pages.adWizard.createAnother")}</button>
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
        >{t("pages.adWizard.backToGenerate")}</button>
      </div>
    </div>
  );
}

/**
 * Short integer formatter for audience-size ranges. Meta returns
 * values like 38600 which we want to render as "38.6k". Above 1M
 * we step to "1.2M". Below 1k we keep the raw integer.
 */
function formatRangeShort(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  }
  return String(Math.round(n));
}
