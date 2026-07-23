"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { buildComposeInstruction, type ComposeInstruction } from "@/lib/leads-gen/share";

type QuickPostT = (key: string, options?: Record<string, unknown>) => string;

/**
 * Quick Post wizard — three steps on a single page so the agent can
 * see all of their inputs at once and tweak mid-stream without
 * losing context.
 *
 *   1. Pick a trigger (7 options post-Phase 1B)
 *   2. Pick a subject (auto-populated from the agent's CRM for
 *      listing-anchored triggers; free-text brief for the others)
 *   3. AI drafts a caption per target platform → inline edit →
 *      share button opens the platform's native compose with the
 *      caption pre-filled (or copy-and-paste for Instagram /
 *      LinkedIn body since those platforms don't support web
 *      compose prefill — see lib/leads-gen/share.ts)
 *
 * Deep-linking: the landing page's "Suggested this week" cards link
 * to this wizard with `?trigger=…&subjectId=…` so the picker steps
 * are skipped and the agent lands on the draft step. See the
 * `useSearchParams` effect below.
 *
 * State machine intentionally minimal — three independent slices
 * (trigger / subject / draft) instead of one giant reducer. The
 * draft is keyed by platform so the agent can switch tabs and the
 * previously-generated draft is still there when they come back.
 */

type Trigger =
  | "new_listing"
  | "open_house"
  | "price_drop"
  | "just_sold"
  | "market_update"
  | "testimonial"
  | "custom"
  | "by_address";

type SubjectKind =
  | "listing"
  | "open_house"
  | "transaction"
  | "market_update"
  | "testimonial"
  | "custom";

type Subject = {
  id: string;
  label: string;
  sub: string | null;
  kind: SubjectKind;
  refId: string | null;
};

type Platform = "facebook" | "instagram" | "linkedin" | "threads" | "x";

type DraftResponse = {
  ok: boolean;
  caption?: string;
  hashtags?: string[];
  compose?: ComposeInstruction;
  subject?: {
    kind: SubjectKind;
    refId: string | null;
    property_address: string | null;
    list_price: number | null;
  };
  error?: string;
};

type DraftState = {
  caption: string;
  hashtags: string[];
  /** Original AI caption — used by "Regenerate" to detect agent edits. */
  originalCaption: string;
  shareUrl: string | null;
};

/**
 * Trigger ids + icons. Labels and hints resolve per-render via
 * `t(\`triggers.${id}.label\`)` and `t(\`triggers.${id}.hint\`)`.
 */
const TRIGGER_OPTIONS: { id: Trigger; icon: string }[] = [
  { id: "new_listing", icon: "🏠" },
  { id: "open_house", icon: "📅" },
  { id: "price_drop", icon: "📉" },
  { id: "just_sold", icon: "🎉" },
  { id: "market_update", icon: "📊" },
  { id: "testimonial", icon: "💬" },
  { id: "custom", icon: "✨" },
  { id: "by_address", icon: "🔗" },
];

/**
 * Per-trigger brief field config. The brief field's role changes by
 * trigger — for listing-anchored triggers it's optional flavor; for
 * the synthetic triggers (custom / market_update / testimonial) it's
 * the only context the model has.
 *
 * The wizard renders the brief input differently based on this — for
 * the synthetic triggers it shows up in step 2 (mandatory before
 * advancing to step 3); for the listing triggers it shows up under
 * the subject picker as an optional "Add an angle" disclosure.
 */
/**
 * Per-trigger brief field config. The brief field's role changes by
 * trigger — for listing-anchored triggers it's optional flavor; for
 * the synthetic triggers (custom / market_update / testimonial) it's
 * the only context the model has.
 *
 * Placeholder / help strings resolve per-render via
 * `t(\`brief.${trigger}.placeholder\`)` and `_.help` so they follow the
 * active locale. Only `required` and `step2Mode` stay in code since
 * they're behavior, not copy.
 */
const BRIEF_CONFIG: Record<
  Trigger,
  {
    /** Brief is required to generate a draft. */
    required: boolean;
    /** Step-2 panel mode:
     *    "picker"  — CRM-anchored listing list (with optional flavor brief)
     *    "brief"   — free-form textarea only (custom / testimonial / market update)
     *    "lookup"  — paste-address-or-URL input that auto-fills the brief
     *               from properties_warehouse (by_address). */
    step2Mode: "picker" | "brief" | "lookup";
  }
> = {
  new_listing: { required: false, step2Mode: "picker" },
  open_house: { required: false, step2Mode: "picker" },
  price_drop: { required: false, step2Mode: "picker" },
  just_sold: { required: false, step2Mode: "picker" },
  market_update: { required: true, step2Mode: "brief" },
  testimonial: { required: true, step2Mode: "brief" },
  custom: { required: true, step2Mode: "brief" },
  by_address: { required: true, step2Mode: "lookup" },
};

/**
 * Platform tabs — brand names are kept as-is (Facebook, Instagram, etc.)
 * since the i18n product decision is to render social-network names
 * untranslated. We expose them via the `id` so the JSX can render
 * `PLATFORM_TABS.find(...).id`-derived label directly.
 */
const PLATFORM_TABS: { id: Platform; label: string }[] = [
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "threads", label: "Threads" },
  { id: "x", label: "X" },
];

const TRIGGER_IDS = new Set<Trigger>([
  "new_listing",
  "open_house",
  "price_drop",
  "just_sold",
  "market_update",
  "testimonial",
  "custom",
  "by_address",
]);

type MediaItem = {
  id: string;
  storagePath: string;
  signedUrl: string | null;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  label: string | null;
  createdAt: string;
};

/**
 * Connection shape from GET /api/leads-gen/connections. Phase 2A
 * added Meta; Phase 2D added LinkedIn (personal feed via Share API).
 * Renders the "Publish to <Platform>" button + multi-account picker
 * when an agent manages several connections for the same platform.
 * When the agent has no connections, the wizard falls back to the
 * compose-URL share where available.
 */
type Connection = {
  id: string;
  platform: "meta" | "linkedin" | "threads";
  fbPageId: string | null;
  fbPageName: string | null;
  igBusinessUserId: string | null;
  igBusinessUsername: string | null;
  linkedinMemberUrn: string | null;
  linkedinMemberEmail: string | null;
  threadsUserId: string | null;
  threadsUsername: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  canPublishFacebook: boolean;
  canPublishInstagram: boolean;
  canPublishLinkedIn: boolean;
  canPublishThreads: boolean;
};

export default function QuickPostClient() {
  const { t } = useTranslation("web_quick_post");
  const searchParams = useSearchParams();
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  /** Set true once we've consumed `?trigger=...&subjectId=...` so the trigger-change effect doesn't blow away the pre-selected subject. */
  const [hydratedFromQuery, setHydratedFromQuery] = useState(false);
  const [brief, setBrief] = useState("");

  // "By address / URL" trigger state. Agent pastes an address or
  // listing URL; we hit /api/leads-gen/lookup-property which calls
  // properties_warehouse + snapshots and returns a pre-stitched
  // brief. The brief textarea then pre-fills with that string and
  // the agent can edit before generating.
  const [lookupInput, setLookupInput] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<{
    address: string;
    found: boolean;
    city: string | null;
    state: string | null;
    beds: number | null;
    baths: number | null;
    sqft: number | null;
    estimatedValue: number | null;
    listingStatus: string | null;
    brief: string;
  } | null>(null);
  const [platform, setPlatform] = useState<Platform>("facebook");
  // Drafts keyed by platform so switching tabs doesn't drop work.
  const [drafts, setDrafts] = useState<Partial<Record<Platform, DraftState>>>({});
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Image picker state — selected media item attaches to the post.
  // One image per draft. Persists across platform-tab switches
  // because the same image works for FB / IG / LI / X.
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Phase 2A.2 — connected social accounts (Meta Pages). When present
  // for the active platform, the share row swaps the compose-URL
  // button for a direct "Publish to Facebook/Instagram" button.
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    Partial<Record<Platform, string>>
  >({});
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<
    | { ok: true; postId: string; externalPostUrl: string | null; platform: Platform }
    | { ok: false; error: string }
    | null
  >(null);

  // Phase 2C — Schedule-for-later: an alternate path to /publish that
  // queues the post for the cron to publish at the agent's chosen
  // datetime. Toggled per-platform tab so an agent could (in theory)
  // publish to FB now AND schedule the same caption to IG for the
  // morning. In practice they'll use one path at a time.
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(() => {
    // Default = tomorrow at 9am local — sensible for "share this
    // listing tomorrow morning" use case. Agent overrides anytime.
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    // datetime-local input wants `YYYY-MM-DDTHH:mm` with no Z.
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [scheduling, setScheduling] = useState(false);
  const [scheduleResult, setScheduleResult] = useState<
    | { ok: true; scheduledPostId: string; scheduledFor: string; platform: Platform }
    | { ok: false; error: string }
    | null
  >(null);

  // Phase 2D — Recurring posts. The schedule-mode toggle expands a
  // "Make this recurring" toggle inside it; turning recurring on
  // POSTs to /api/leads-gen/recurring instead of /schedule and
  // creates a template that the materialize-cron expands on a
  // daily / weekly cadence.
  const [recurringMode, setRecurringMode] = useState(false);
  const [recurringCadence, setRecurringCadence] = useState<"daily" | "weekly">(
    "weekly",
  );
  const [recurringWeekday, setRecurringWeekday] = useState(1); // Monday default
  const [recurringHour, setRecurringHour] = useState(9);
  const [recurringMinute, setRecurringMinute] = useState(0);
  // Default to the browser's IANA tz so the agent doesn't have to
  // pick — usually "the post fires at 9am in MY time" is what they
  // want.
  const [recurringTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [recurringMaxOccurrences, setRecurringMaxOccurrences] = useState<
    number | ""
  >(12); // 12 weeks of "Monday mornings" by default
  const [creatingRecurring, setCreatingRecurring] = useState(false);
  const [recurringResult, setRecurringResult] = useState<
    | { ok: true; recurringScheduleId: string; nextOccurrenceAt: string }
    | { ok: false; error: string }
    | null
  >(null);

  const currentDraft = drafts[platform] ?? null;
  const subject = useMemo(
    () => subjects.find((s) => s.id === subjectId) ?? null,
    [subjects, subjectId],
  );
  const briefConfig = trigger ? BRIEF_CONFIG[trigger] : null;

  // Connections that can publish on the currently-selected platform.
  // Phase 2A added Facebook + Instagram (Meta connections); Phase 2D
  // added LinkedIn (personal feed via Share API). X still falls back
  // to compose-URL share.
  const eligibleConnections = useMemo(() => {
    if (platform === "facebook") {
      return connections.filter((c) => c.canPublishFacebook);
    }
    if (platform === "instagram") {
      return connections.filter((c) => c.canPublishInstagram);
    }
    if (platform === "linkedin") {
      return connections.filter((c) => c.canPublishLinkedIn);
    }
    if (platform === "threads") {
      return connections.filter((c) => c.canPublishThreads);
    }
    return [];
  }, [connections, platform]);
  const activeConnectionId =
    selectedConnectionId[platform] ?? eligibleConnections[0]?.id ?? null;
  const activeConnection =
    eligibleConnections.find((c) => c.id === activeConnectionId) ?? null;

  // Hydrate trigger + subject from URL on mount (deep-link from the
  // "Suggested this week" landing cards). Only runs once — subsequent
  // trigger changes are user-driven.
  useEffect(() => {
    if (hydratedFromQuery) return;
    const t = (searchParams?.get("trigger") ?? "").trim();
    if (t && (TRIGGER_IDS as Set<string>).has(t)) {
      setTrigger(t as Trigger);
    }
    setHydratedFromQuery(true);
  }, [searchParams, hydratedFromQuery]);

  // Load subjects when the trigger changes. If we deep-linked in with
  // a subjectId, pre-select it once the matching subject row arrives.
  useEffect(() => {
    if (!trigger) return;
    let cancelled = false;
    setSubjectsLoading(true);
    setSubjectsError(null);
    setSubjects([]);
    // Read the deep-link subjectId ONCE per trigger-change so a user
    // who switches triggers manually after deep-linking doesn't see
    // the stale subject re-applied.
    const deepLinkSubjectId = hydratedFromQuery
      ? (searchParams?.get("subjectId") ?? "").trim()
      : "";
    if (!deepLinkSubjectId) setSubjectId(null);
    fetch(`/api/leads-gen/subjects?trigger=${encodeURIComponent(trigger)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          subjects?: Subject[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? t("errors.subjects_load_failed"));
        }
        const list = body.subjects ?? [];
        setSubjects(list);
        // Priority order for auto-select:
        //   1. Deep-link subjectId (from landing-card click)
        //   2. Single-option synthetic triggers (custom / market_update / testimonial)
        if (deepLinkSubjectId && list.some((s) => s.id === deepLinkSubjectId)) {
          setSubjectId(deepLinkSubjectId);
        } else if (
          (trigger === "custom" ||
            trigger === "market_update" ||
            trigger === "testimonial") &&
          list.length === 1
        ) {
          setSubjectId(list[0].id);
        }
      })
      .catch((e) => {
        if (!cancelled) setSubjectsError(e instanceof Error ? e.message : t("errors.subjects_load_short"));
      })
      .finally(() => {
        if (!cancelled) setSubjectsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // searchParams intentionally captured at trigger-change time —
    // we don't want subsequent param mutations to retrigger the fetch.
    // searchParams + t intentionally not in deps — captured at trigger-change
    // time so locale flips mid-flight don't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  /**
   * Look up a property by address or URL. Pre-fills the brief with
   * the stitched description so the agent can edit before
   * generating. Also commits the synthetic subjectId so step 3
   * unlocks.
   */
  const runLookup = useCallback(async () => {
    const input = lookupInput.trim();
    if (!input || input.length < 3) {
      setLookupError(t("errors.lookup_input_required"));
      return;
    }
    setLookupBusy(true);
    setLookupError(null);
    try {
      const res = await fetch("/api/leads-gen/lookup-property", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        result?: typeof lookupResult;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.result) {
        throw new Error(body.error ?? t("errors.lookup_failed"));
      }
      setLookupResult(body.result);
      setBrief(body.result.brief);
      // Commit the synthetic subject so step 3 unlocks. Use
      // "by_address" as the id; subject_kind on the wire is "custom"
      // since we don't have a CRM record id to attach.
      setSubjectId("by_address");
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : t("errors.lookup_failed"));
    } finally {
      setLookupBusy(false);
    }
  }, [lookupInput, lookupResult, t]);

  const generate = useCallback(async () => {
    if (!trigger || !subjectId) return;
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/leads-gen/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger,
          subjectId,
          platform,
          brief: brief.trim() || null,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as DraftResponse;
      if (!res.ok || !body.ok) throw new Error(body.error ?? t("errors.draft_failed"));
      setDrafts((prev) => ({
        ...prev,
        [platform]: {
          caption: body.caption ?? "",
          hashtags: body.hashtags ?? [],
          originalCaption: body.caption ?? "",
          shareUrl: body.compose?.shareUrl ?? null,
        },
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.draft_failed"));
    } finally {
      setDrafting(false);
    }
  }, [trigger, subjectId, platform, brief, t]);

  const updateCaption = useCallback(
    (next: string) => {
      setDrafts((prev) => ({
        ...prev,
        [platform]: prev[platform]
          ? { ...prev[platform]!, caption: next }
          : prev[platform],
      }));
    },
    [platform],
  );

  const compose: ComposeInstruction | null = useMemo(() => {
    if (!currentDraft) return null;
    return buildComposeInstruction({
      platform,
      caption: currentDraft.caption,
      hashtags: currentDraft.hashtags,
      shareUrl: currentDraft.shareUrl,
    });
  }, [currentDraft, platform]);

  // Fetch the agent's connections once on mount. Failure here is
  // non-fatal — wizard falls back to compose-URL share when the
  // list is empty (same path as a no-connection state).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/leads-gen/connections")
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          connections?: Connection[];
        };
        if (cancelled) return;
        if (body.ok && Array.isArray(body.connections)) {
          setConnections(body.connections);
        }
      })
      .catch(() => {
        // Non-fatal — show compose-URL fallback instead.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Direct publish via the platform's official API:
  //   - facebook / instagram → Meta Graph API
  //   - linkedin             → LinkedIn Share API (/rest/posts)
  // Available when the platform is one of those AND the agent has
  // a connected account that supports that platform. X still falls
  // back to the compose-URL share.
  const publish = useCallback(async () => {
    if (!currentDraft || !activeConnection) return;
    if (
      platform !== "facebook" &&
      platform !== "instagram" &&
      platform !== "linkedin" &&
      platform !== "threads"
    )
      return;
    setPublishResult(null);
    setPublishing(true);
    try {
      const res = await fetch("/api/leads-gen/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          connectionId: activeConnection.id,
          caption: currentDraft.caption,
          hashtags: currentDraft.hashtags,
          mediaItemId: selectedMedia?.id ?? undefined,
          trigger: trigger ?? undefined,
          subjectKind: subject?.kind ?? undefined,
          subjectRefId: subject?.refId ?? undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        postId?: string;
        externalPostUrl?: string | null;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setPublishResult({
          ok: false,
          error: body.error ?? t("errors.publish_failed"),
        });
        return;
      }
      setPublishResult({
        ok: true,
        postId: body.postId ?? "",
        externalPostUrl: body.externalPostUrl ?? null,
        platform,
      });
    } catch (e) {
      setPublishResult({
        ok: false,
        error: e instanceof Error ? e.message : t("errors.publish_failed"),
      });
    } finally {
      setPublishing(false);
    }
  }, [currentDraft, activeConnection, platform, selectedMedia, trigger, subject, t]);

  // Reset publish result when the agent switches platforms or
  // re-generates the draft — stale "Published ✓" banner on a
  // freshly-regenerated caption would be misleading.
  useEffect(() => {
    setPublishResult(null);
    setScheduleResult(null);
    setRecurringResult(null);
  }, [platform, currentDraft?.caption]);

  // Schedule for later — POSTs to /api/leads-gen/schedule instead of
  // /publish. The cron at /api/cron/publish-scheduled picks it up at
  // fire time and runs through the same publish helper. We don't
  // validate token freshness here — the cron does that just-in-time
  // since tokens can expire/rotate between schedule and fire.
  const schedule = useCallback(async () => {
    if (!currentDraft || !activeConnection) return;
    if (
      platform !== "facebook" &&
      platform !== "instagram" &&
      platform !== "linkedin" &&
      platform !== "threads"
    )
      return;
    setScheduleResult(null);
    setScheduling(true);
    try {
      // Convert datetime-local (no timezone) to ISO with the
      // browser's local offset, then to ISO UTC for the API.
      const localMs = new Date(scheduledFor).getTime();
      if (!Number.isFinite(localMs)) {
        throw new Error(t("errors.invalid_datetime"));
      }
      const scheduledForIso = new Date(localMs).toISOString();
      const res = await fetch("/api/leads-gen/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          connectionId: activeConnection.id,
          caption: currentDraft.caption,
          hashtags: currentDraft.hashtags,
          mediaItemId: selectedMedia?.id ?? undefined,
          scheduledFor: scheduledForIso,
          trigger: trigger ?? undefined,
          subjectKind: subject?.kind ?? undefined,
          subjectRefId: subject?.refId ?? undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        scheduledPostId?: string;
        scheduledFor?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.scheduledPostId || !body.scheduledFor) {
        setScheduleResult({ ok: false, error: body.error ?? t("errors.schedule_failed") });
        return;
      }
      setScheduleResult({
        ok: true,
        scheduledPostId: body.scheduledPostId,
        scheduledFor: body.scheduledFor,
        platform,
      });
      // Reset the toggle so the agent isn't tempted to double-schedule.
      setScheduleMode(false);
    } catch (e) {
      setScheduleResult({
        ok: false,
        error: e instanceof Error ? e.message : t("errors.schedule_failed"),
      });
    } finally {
      setScheduling(false);
    }
  }, [
    currentDraft,
    activeConnection,
    platform,
    scheduledFor,
    selectedMedia,
    trigger,
    subject,
    t,
  ]);

  // Make this recurring — POSTs to /api/leads-gen/recurring. Creates
  // a template that the materialize-cron expands on a daily/weekly
  // cadence. Mirrors `schedule()` in shape but adds the cadence
  // config.
  const createRecurring = useCallback(async () => {
    if (!currentDraft || !activeConnection) return;
    if (platform !== "facebook" && platform !== "instagram") return;
    setRecurringResult(null);
    setCreatingRecurring(true);
    try {
      const res = await fetch("/api/leads-gen/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          connectionId: activeConnection.id,
          caption: currentDraft.caption,
          hashtags: currentDraft.hashtags,
          mediaItemId: selectedMedia?.id ?? undefined,
          trigger: trigger ?? undefined,
          subjectKind: subject?.kind ?? undefined,
          subjectRefId: subject?.refId ?? undefined,
          cadence: recurringCadence,
          weeklyDayOfWeek:
            recurringCadence === "weekly" ? recurringWeekday : undefined,
          timeOfDayHour: recurringHour,
          timeOfDayMinute: recurringMinute,
          timezone: recurringTimezone,
          maxOccurrences:
            typeof recurringMaxOccurrences === "number"
              ? recurringMaxOccurrences
              : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        recurringScheduleId?: string;
        nextOccurrenceAt?: string;
        error?: string;
      };
      if (
        !res.ok ||
        !body.ok ||
        !body.recurringScheduleId ||
        !body.nextOccurrenceAt
      ) {
        setRecurringResult({
          ok: false,
          error: body.error ?? t("errors.recurring_failed"),
        });
        return;
      }
      setRecurringResult({
        ok: true,
        recurringScheduleId: body.recurringScheduleId,
        nextOccurrenceAt: body.nextOccurrenceAt,
      });
      // Reset the toggles so the agent isn't tempted to re-submit.
      setRecurringMode(false);
      setScheduleMode(false);
    } catch (e) {
      setRecurringResult({
        ok: false,
        error: e instanceof Error ? e.message : t("errors.recurring_failed"),
      });
    } finally {
      setCreatingRecurring(false);
    }
  }, [
    currentDraft,
    activeConnection,
    platform,
    selectedMedia,
    trigger,
    subject,
    recurringCadence,
    recurringWeekday,
    recurringHour,
    recurringMinute,
    recurringTimezone,
    recurringMaxOccurrences,
    t,
  ]);

  // Lazy-load the library the first time the agent opens the picker.
  const ensureLibraryLoaded = useCallback(async () => {
    if (libraryLoading) return;
    setLibraryError(null);
    setLibraryLoading(true);
    try {
      const res = await fetch("/api/leads-gen/media/list");
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        items?: MediaItem[];
        error?: string;
      };
      if (!res.ok || !body.ok) throw new Error(body.error ?? t("errors.library_load_failed"));
      setLibrary(body.items ?? []);
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : t("errors.library_load_failed"));
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryLoading, t]);

  const uploadFile = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/leads-gen/media/upload", {
        method: "POST",
        body: form,
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        item?: MediaItem;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.item) {
        throw new Error(body.error ?? t("errors.upload_failed"));
      }
      // Prepend to the library list AND auto-select the upload so
      // the agent doesn't need an extra click to attach it.
      setLibrary((prev) => [body.item!, ...prev.filter((m) => m.id !== body.item!.id)]);
      setSelectedMedia(body.item);
      setShowLibrary(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.upload_failed"));
    } finally {
      setUploading(false);
    }
  }, [t]);

  const downloadSelectedImage = useCallback(async () => {
    if (!selectedMedia?.signedUrl) return;
    try {
      const res = await fetch(selectedMedia.signedUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = selectedMedia.fileName || "post-image";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      // Fallback: open the signed URL in a new tab and let the user save manually.
      window.open(selectedMedia.signedUrl, "_blank", "noopener,noreferrer");
    }
  }, [selectedMedia]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t("header.title")}</h1>
          <p className="text-sm text-gray-500">{t("header.subtitle")}</p>
        </div>
        <Link
          href="/dashboard/leads/generate"
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          {t("header.back")}
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Step 1 — Trigger */}
      <Section
        n={1}
        title={t("step1.title")}
        subtitle={t("step1.subtitle")}
      >
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {TRIGGER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setTrigger(opt.id);
                // Reset brief when switching triggers since the
                // placeholder text + required-ness changes per trigger;
                // a stale brief from a prior trigger is rarely useful.
                setBrief("");
                // Also reset the address-lookup state so swapping
                // to "By address" doesn't surface a previous run's
                // result.
                setLookupInput("");
                setLookupResult(null);
                setLookupError(null);
              }}
              className={`group rounded-xl border p-4 text-left transition ${
                trigger === opt.id
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100"
                  : "border-gray-200 bg-white hover:border-blue-300 hover:bg-blue-50/30"
              }`}
            >
              <div className="text-2xl">{opt.icon}</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">{t(`triggers.${opt.id}.label`)}</div>
              <div className="mt-0.5 text-xs text-gray-500">{t(`triggers.${opt.id}.hint`)}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* Step 2 — Subject + optional brief
          Two modes per trigger config:
            - "picker": show the CRM-backed subject list. Brief is an
              optional disclosure-style accordion under it.
            - "brief": no picker — just the brief textarea (it IS the
              subject). The synthetic subject id is auto-selected when
              the user types content.
      */}
      {trigger && briefConfig && (
        <Section
          n={2}
          title={
            briefConfig.step2Mode === "lookup"
              ? t("step2.title_lookup")
              : briefConfig.step2Mode === "brief"
                ? t("step2.title_brief")
                : t("step2.title_picker")
          }
          subtitle={
            briefConfig.step2Mode === "lookup"
              ? t("step2.subtitle_lookup")
              : briefConfig.step2Mode === "brief"
                ? t("step2.subtitle_brief")
                : trigger === "new_listing"
                  ? t("step2.subtitle_picker_new_listing")
                  : trigger === "open_house"
                    ? t("step2.subtitle_picker_open_house")
                    : trigger === "price_drop"
                      ? t("step2.subtitle_picker_price_drop")
                      : t("step2.subtitle_picker_just_sold")
          }
        >
          {briefConfig.step2Mode === "lookup" ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={lookupInput}
                  onChange={(e) => setLookupInput(e.target.value)}
                  placeholder={t("step2.lookup.input_placeholder")}
                  className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !lookupBusy) {
                      e.preventDefault();
                      void runLookup();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void runLookup()}
                  disabled={lookupBusy || lookupInput.trim().length < 3}
                  className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {lookupBusy ? t("step2.lookup.looking_up_busy") : t("step2.lookup.look_up")}
                </button>
              </div>
              <p className="text-xs text-gray-500">{t(`brief.${trigger}.help`)}</p>
              {lookupError && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                  {lookupError}
                </p>
              )}
              {lookupResult && (
                <div
                  className={`rounded-xl border px-3 py-3 text-xs ${
                    lookupResult.found
                      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                      : "border-amber-200 bg-amber-50 text-amber-900"
                  }`}
                >
                  <p className="font-semibold">
                    {lookupResult.found
                      ? t("step2.lookup.result_found")
                      : t("step2.lookup.result_not_found")}
                  </p>
                  {lookupResult.found && (
                    <p className="mt-0.5">
                      {[
                        lookupResult.beds != null && `${lookupResult.beds}bd`,
                        lookupResult.baths != null && `${lookupResult.baths}ba`,
                        lookupResult.sqft != null &&
                          `${lookupResult.sqft.toLocaleString()} sqft`,
                        lookupResult.estimatedValue != null &&
                          `~$${lookupResult.estimatedValue.toLocaleString()}`,
                        lookupResult.listingStatus,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              )}
              {/* Once a lookup happens (success or not), expose the
                  brief textarea so the agent can tweak before
                  generating. */}
              {subjectId === "by_address" && (
                <div className="space-y-2 pt-2">
                  <label className="block text-xs font-semibold text-gray-700">
                    {t("step2.lookup.brief_label")}
                  </label>
                  <textarea
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    rows={6}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <p className="text-[11px] text-gray-500">
                    {t("step2.lookup.brief_help")}
                  </p>
                </div>
              )}
            </div>
          ) : briefConfig.step2Mode === "brief" ? (
            <BriefInput
              value={brief}
              onChange={setBrief}
              placeholder={t(`brief.${trigger}.placeholder`)}
              help={t(`brief.${trigger}.help`)}
              required={briefConfig.required}
              onCommit={() => {
                // Sync the synthetic subject id once a brief is typed.
                if (trigger === "custom") setSubjectId("custom");
                else if (trigger === "market_update") setSubjectId("market_update");
                else if (trigger === "testimonial") setSubjectId("testimonial");
              }}
              committed={subjectId !== null}
              t={t}
            />
          ) : subjectsLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
              {t("step2.loading")}
            </div>
          ) : subjectsError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {subjectsError}
            </p>
          ) : subjects.length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              {emptyStateMessage(trigger, t)}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {subjects.map((s) => (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      subjectId === s.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-blue-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="subject"
                      value={s.id}
                      checked={subjectId === s.id}
                      onChange={() => setSubjectId(s.id)}
                      className="mt-0.5 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{s.label}</div>
                      {s.sub && <div className="text-xs text-gray-500">{s.sub}</div>}
                    </div>
                  </label>
                ))}
              </div>

              {/* Optional brief disclosure — picker triggers offer an
                  "Add an angle" expander where the agent can pass
                  flavor (e.g. old price for a drop, multiple-offers
                  for a just-sold) to the model. */}
              {subjectId && (
                <details className="mt-4 rounded-lg border border-gray-200 bg-gray-50/60">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-700 hover:text-gray-900">
                    {t("step2.add_angle")}
                  </summary>
                  <div className="border-t border-gray-200 px-3 py-3">
                    <BriefInput
                      value={brief}
                      onChange={setBrief}
                      placeholder={t(`brief.${trigger}.placeholder`)}
                      help={t(`brief.${trigger}.help`)}
                      required={false}
                      onCommit={() => {}}
                      committed={false}
                      inline
                      t={t}
                    />
                  </div>
                </details>
              )}
            </>
          )}
        </Section>
      )}

      {/* Step 3 — Draft + share */}
      {subjectId && (
        <Section
          n={3}
          title={t("step3.title")}
          subtitle={t("step3.subtitle")}
        >
          <div className="space-y-3">
            <div className="flex items-center gap-1 border-b border-gray-200">
              {PLATFORM_TABS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlatform(p.id)}
                  className={`px-3 py-1.5 text-sm font-medium transition border-b-2 -mb-px ${
                    platform === p.id
                      ? "border-blue-600 text-blue-700"
                      : "border-transparent text-gray-500 hover:text-gray-900"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {!currentDraft ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 p-6 text-center">
                <p className="text-sm text-gray-600">
                  {t("step3.no_draft", { platform: PLATFORM_TABS.find((p) => p.id === platform)?.label })}
                </p>
                <button
                  type="button"
                  onClick={generate}
                  disabled={drafting}
                  className="mt-3 rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
                >
                  {drafting ? t("step3.drafting") : t("step3.generate")}
                </button>
              </div>
            ) : (
              <>
                <textarea
                  value={currentDraft.caption}
                  onChange={(e) => updateCaption(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                {currentDraft.hashtags.length > 0 && platform !== "instagram" && (
                  <div className="flex flex-wrap gap-1.5">
                    {currentDraft.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Image picker. Single image per draft. The image
                    attaches to all platform tabs since the same hero
                    works for FB / IG / LI / X. Web compose URLs
                    don't actually let us attach images directly
                    (FB sharer reads OG tags from the URL it shares,
                    not from upload — Phase 2 fixes this by posting
                    via Meta's Graph API). For now the wizard
                    surfaces a "Save image" button on the share row
                    so the agent has the file ready when they paste
                    the caption into the native app / web compose. */}
                <ImagePicker
                  selected={selectedMedia}
                  showLibrary={showLibrary}
                  library={library}
                  libraryLoading={libraryLoading}
                  libraryError={libraryError}
                  uploading={uploading}
                  onOpenLibrary={async () => {
                    setShowLibrary(true);
                    await ensureLibraryLoaded();
                  }}
                  onCloseLibrary={() => setShowLibrary(false)}
                  onSelect={(m) => {
                    setSelectedMedia(m);
                    setShowLibrary(false);
                  }}
                  onClear={() => setSelectedMedia(null)}
                  onUpload={uploadFile}
                  t={t}
                />

                {/* Multi-account picker — only renders when the agent
                    has several accounts that can post on this
                    platform. Single connection auto-selects. */}
                {eligibleConnections.length > 1 && activeConnection && (
                  <div className="flex items-center gap-2 text-xs">
                    <label className="text-gray-600">{t("step3.post_to")}</label>
                    <select
                      value={activeConnection.id}
                      onChange={(e) =>
                        setSelectedConnectionId((prev) => ({
                          ...prev,
                          [platform]: e.target.value,
                        }))
                      }
                      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                    >
                      {eligibleConnections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {platform === "instagram" && c.igBusinessUsername
                            ? `@${c.igBusinessUsername}`
                            : platform === "threads"
                              ? c.threadsUsername
                                ? `@${c.threadsUsername}`
                                : c.displayName ?? t("step3.threads_account_fallback")
                              : platform === "linkedin"
                                ? c.displayName ?? t("step3.linkedin_member_fallback")
                                : c.fbPageName ?? t("step3.page_fallback")}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={generate}
                    disabled={drafting}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {drafting ? t("step3.regenerating") : t("step3.regenerate")}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(currentDraft.caption).catch(() => {})
                    }
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {t("step3.copy_caption")}
                  </button>

                  {selectedMedia && (
                    <button
                      type="button"
                      onClick={downloadSelectedImage}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t("step3.save_image")}
                    </button>
                  )}

                  <span className="flex-1" />

                  {/* Three mutually-exclusive paths for the primary
                      action button:
                        1. Eligible connection exists → direct publish OR schedule via Meta Graph API
                        2. Compose URL available    → opens platform's native compose
                        3. Neither                  → hint
                  */}
                  {activeConnection &&
                  (platform === "facebook" ||
                    platform === "instagram" ||
                    platform === "linkedin" ||
                    platform === "threads") ? (
                    recurringMode ? (
                      <button
                        type="button"
                        onClick={createRecurring}
                        disabled={creatingRecurring || !currentDraft?.caption.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                      >
                        {creatingRecurring ? t("actions.creating_recurring") : t("actions.create_recurring")}
                      </button>
                    ) : scheduleMode ? (
                      <button
                        type="button"
                        onClick={schedule}
                        disabled={scheduling || !currentDraft?.caption.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {scheduling ? t("actions.scheduling") : t("actions.schedule")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={publish}
                        disabled={publishing || !currentDraft?.caption.trim()}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {publishing
                          ? t("actions.publishing")
                          : t("actions.publish_to", { platform: PLATFORM_TABS.find((p) => p.id === platform)?.label })}
                      </button>
                    )
                  ) : compose && compose.composeUrl ? (
                    <a
                      href={compose.composeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {t("actions.share_to", { platform: PLATFORM_TABS.find((p) => p.id === platform)?.label })}
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M13.5 4.5l7.5 7.5-7.5 7.5"
                        />
                      </svg>
                    </a>
                  ) : (
                    <span className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-600">
                      {platform === "instagram"
                        ? t("actions.ig_no_compose")
                        : t("actions.no_share")}
                    </span>
                  )}
                </div>

                {/* Schedule-for-later affordance — only relevant when
                    an active connection exists (the only path the
                    cron can publish on). Renders as a small toggle
                    that expands into a datetime input + Schedule
                    button. The Publish button above swaps to a
                    Schedule button when scheduleMode is on (see
                    the action row). */}
                {activeConnection &&
                  (platform === "facebook" ||
                    platform === "instagram" ||
                    platform === "linkedin" ||
                    platform === "threads") &&
                  !recurringMode && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50/60 px-3 py-2.5 text-sm">
                      {!scheduleMode ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setScheduleMode(true)}
                            className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
                          >
                            {t("schedule.later_cta")}
                          </button>
                          <span className="text-gray-300">·</span>
                          <button
                            type="button"
                            onClick={() => {
                              setRecurringMode(true);
                              setScheduleMode(false);
                            }}
                            className="text-xs font-medium text-purple-700 hover:text-purple-900"
                          >
                            {t("schedule.recurring_cta")}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label
                              htmlFor="schedule-datetime"
                              className="text-xs font-semibold text-gray-900"
                            >
                              {t("schedule.label")}
                            </label>
                            <button
                              type="button"
                              onClick={() => setScheduleMode(false)}
                              className="text-xs text-gray-500 hover:text-gray-900"
                            >
                              {t("schedule.cancel")}
                            </button>
                          </div>
                          <input
                            id="schedule-datetime"
                            type="datetime-local"
                            value={scheduledFor}
                            onChange={(e) => setScheduledFor(e.target.value)}
                            min={(() => {
                              // Disallow scheduling in the past at the input level.
                              const d = new Date(Date.now() + 60 * 1000);
                              const pad = (n: number) => String(n).padStart(2, "0");
                              return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                            })()}
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                          />
                          <p className="text-[11px] text-gray-500">
                            {t("schedule.cron_hint")}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                {/* Recurring-post config — only relevant when an active
                    connection exists. Toggle on the prior section flips
                    recurringMode; this section renders the cadence /
                    day-of-week / time-of-day / max-occurrences inputs.
                    The Publish button up top swaps to "Create recurring"
                    when recurringMode is on. */}
                {activeConnection &&
                  (platform === "facebook" ||
                    platform === "instagram" ||
                    platform === "linkedin" ||
                    platform === "threads") &&
                  recurringMode && (
                    <div className="rounded-xl border border-purple-200 bg-purple-50/60 px-3 py-2.5 text-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-purple-900">
                          {t("recurring.header")}
                        </p>
                        <button
                          type="button"
                          onClick={() => setRecurringMode(false)}
                          className="text-xs text-gray-500 hover:text-gray-900"
                        >
                          {t("recurring.cancel")}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-xs">
                          <span className="mb-1 block font-medium text-gray-700">
                            {t("recurring.cadence_label")}
                          </span>
                          <select
                            value={recurringCadence}
                            onChange={(e) =>
                              setRecurringCadence(
                                e.target.value as "daily" | "weekly",
                              )
                            }
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                          >
                            <option value="weekly">{t("recurring.cadence_weekly")}</option>
                            <option value="daily">{t("recurring.cadence_daily")}</option>
                          </select>
                        </label>

                        {recurringCadence === "weekly" && (
                          <label className="text-xs">
                            <span className="mb-1 block font-medium text-gray-700">
                              {t("recurring.weekday_label")}
                            </span>
                            <select
                              value={recurringWeekday}
                              onChange={(e) =>
                                setRecurringWeekday(Number(e.target.value))
                              }
                              className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                            >
                              <option value={0}>{t("recurring.weekdays.sun")}</option>
                              <option value={1}>{t("recurring.weekdays.mon")}</option>
                              <option value={2}>{t("recurring.weekdays.tue")}</option>
                              <option value={3}>{t("recurring.weekdays.wed")}</option>
                              <option value={4}>{t("recurring.weekdays.thu")}</option>
                              <option value={5}>{t("recurring.weekdays.fri")}</option>
                              <option value={6}>{t("recurring.weekdays.sat")}</option>
                            </select>
                          </label>
                        )}

                        <label className="text-xs">
                          <span className="mb-1 block font-medium text-gray-700">
                            {t("recurring.time_label", { tz: recurringTimezone })}
                          </span>
                          <input
                            type="time"
                            value={`${String(recurringHour).padStart(2, "0")}:${String(recurringMinute).padStart(2, "0")}`}
                            onChange={(e) => {
                              const [hStr, mStr] = e.target.value.split(":");
                              const h = parseInt(hStr ?? "0", 10);
                              const m = parseInt(mStr ?? "0", 10);
                              if (Number.isFinite(h)) setRecurringHour(h);
                              if (Number.isFinite(m)) setRecurringMinute(m);
                            }}
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                          />
                        </label>

                        <label className="text-xs">
                          <span className="mb-1 block font-medium text-gray-700">
                            {t("recurring.max_label")}
                          </span>
                          <input
                            type="number"
                            min={1}
                            max={365}
                            value={recurringMaxOccurrences}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "") {
                                setRecurringMaxOccurrences("");
                              } else {
                                const n = parseInt(v, 10);
                                if (Number.isFinite(n) && n > 0) {
                                  setRecurringMaxOccurrences(n);
                                }
                              }
                            }}
                            placeholder={t("recurring.max_placeholder")}
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
                          />
                        </label>
                      </div>

                      <p className="text-[11px] text-gray-600">
                        {t("recurring.hint_prefix")}
                        <a
                          href="/dashboard/leads/generate/recurring"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-purple-700 hover:underline"
                        >
                          {t("recurring.hint_link")}
                        </a>
                        {t("recurring.hint_suffix")}
                      </p>
                    </div>
                  )}

                {/* Recurring result banner */}
                {(() => {
                  const result = recurringResult;
                  if (!result) return null;
                  if (result.ok === true) {
                    const when = new Date(result.nextOccurrenceAt);
                    return (
                      <div className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2.5 text-sm text-purple-900">
                        <p className="font-semibold">
                          {t("banners.recurring_created", { when: when.toLocaleString() })}
                        </p>
                        <p className="mt-0.5">
                          <a
                            href="/dashboard/leads/generate/recurring"
                            className="underline hover:text-purple-700"
                          >
                            {t("banners.recurring_manage")}
                          </a>
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
                      <p className="font-semibold">{t("banners.recurring_failed")}</p>
                      <p className="mt-0.5">{result.error}</p>
                    </div>
                  );
                })()}

                {/* Schedule result banner — separate from publishResult
                    so a successful schedule doesn't clear the publish
                    banner (the two are independent actions). */}
                {(() => {
                  const result = scheduleResult;
                  if (!result) return null;
                  if (result.ok === true) {
                    const when = new Date(result.scheduledFor);
                    return (
                      <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2.5 text-sm text-indigo-900">
                        <p className="font-semibold">
                          {t("banners.scheduled_for", { when: when.toLocaleString() })}
                        </p>
                        <p className="mt-0.5">
                          <a
                            href="/dashboard/leads/generate/scheduled"
                            className="underline hover:text-indigo-700"
                          >
                            {t("banners.view_scheduled")}
                          </a>
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
                      <p className="font-semibold">{t("banners.schedule_failed")}</p>
                      <p className="mt-0.5">{result.error}</p>
                    </div>
                  );
                })()}

                {/* Result banner for direct publishes. IIFE wraps the
                    narrowing in early-return form so TS narrows the
                    discriminated union reliably under stricter
                    settings (the nested-ternary form failed Vercel's
                    typecheck in #399). */}
                {(() => {
                  const result = publishResult;
                  if (!result) return null;
                  if (result.ok === true) {
                    return (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-900">
                        <p className="font-semibold">
                          {t("banners.published_to", { platform: PLATFORM_TABS.find((p) => p.id === result.platform)?.label })}
                        </p>
                        {result.externalPostUrl && (
                          <p className="mt-0.5">
                            <a
                              href={result.externalPostUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-emerald-700"
                            >
                              {t("banners.view_post")}
                            </a>
                          </p>
                        )}
                      </div>
                    );
                  }
                  return (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900">
                      <p className="font-semibold">{t("banners.publish_failed")}</p>
                      <p className="mt-0.5">{result.error}</p>
                    </div>
                  );
                })()}

                {/* When no connections exist for this platform, nudge
                    the agent toward the Connect page. */}
                {!activeConnection &&
                  (platform === "facebook" || platform === "instagram") && (
                    <p className="text-xs text-gray-500">
                      {t("connect_nudge.meta_prefix")}
                      <a
                        href="/dashboard/leads/generate/connect"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {t("connect_nudge.meta_link")}
                      </a>
                      {t("connect_nudge.meta_suffix")}
                    </p>
                  )}
                {!activeConnection && platform === "linkedin" && (
                  <p className="text-xs text-gray-500">
                    {t("connect_nudge.linkedin_prefix")}
                    <a
                      href="/dashboard/leads/generate/connect"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sky-700 hover:underline"
                    >
                      {t("connect_nudge.linkedin_link")}
                    </a>
                    {t("connect_nudge.linkedin_suffix")}
                  </p>
                )}
                {!activeConnection && platform === "threads" && (
                  <p className="text-xs text-gray-500">
                    {t("connect_nudge.threads_prefix")}
                    <a
                      href="/dashboard/leads/generate/connect"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-gray-900 hover:underline"
                    >
                      {t("connect_nudge.threads_link")}
                    </a>
                    {t("connect_nudge.threads_suffix")}
                  </p>
                )}

                {compose && !compose.prefillsBody && compose.composeUrl && !activeConnection && (
                  <p className="text-xs text-amber-700">
                    {platform === "linkedin"
                      ? t("compose_hint.linkedin")
                      : t("compose_hint.default")}
                  </p>
                )}
              </>
            )}
          </div>
        </Section>
      )}

      {/* Footer hint — explains the next phase so the agent knows what's coming */}
      {subjectId && (
        <p className="text-xs text-gray-400">
          {t("footer")}
        </p>
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
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white">
          {n}
        </div>
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Brief textarea + help text. Two visual modes:
 *   - Standalone (`inline` false): full input + "Use this brief" button
 *     that commits the synthetic subject id. Used in step-2 "brief" mode
 *     (custom / market_update / testimonial).
 *   - Inline (`inline` true): just the textarea, no commit button. Used
 *     inside the "Add an angle" disclosure on listing-anchored triggers.
 */
function BriefInput({
  value,
  onChange,
  placeholder,
  help,
  required,
  onCommit,
  committed,
  inline,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  help: string;
  required: boolean;
  onCommit: () => void;
  committed: boolean;
  inline?: boolean;
  t: QuickPostT;
}) {
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={inline ? 3 : 4}
        className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      <p className="text-xs text-gray-500">{help}</p>
      {!inline && (
        <button
          type="button"
          onClick={onCommit}
          disabled={(required && !value.trim()) || committed}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {committed ? t("brief_input.saved") : t("brief_input.use_this")}
        </button>
      )}
    </div>
  );
}

/**
 * Image picker for the wizard's draft step. Three modes via the
 * `showLibrary` flag:
 *   - No selection, library closed: a compact "Add an image" prompt
 *     with two buttons (Upload / Library) and a Skip option.
 *   - Library open: grid of thumbnails from the media library
 *     (newest-first) + an Upload tile, agent picks one.
 *   - Selection made: hero preview + Change / Remove buttons.
 *
 * Drag-and-drop on the compact prompt is wired so a phone-snap
 * dragged from another tab uploads in one motion.
 */
function ImagePicker({
  selected,
  showLibrary,
  library,
  libraryLoading,
  libraryError,
  uploading,
  onOpenLibrary,
  onCloseLibrary,
  onSelect,
  onClear,
  onUpload,
  t,
}: {
  selected: MediaItem | null;
  showLibrary: boolean;
  library: MediaItem[];
  libraryLoading: boolean;
  libraryError: string | null;
  uploading: boolean;
  onOpenLibrary: () => void;
  onCloseLibrary: () => void;
  onSelect: (m: MediaItem) => void;
  onClear: () => void;
  onUpload: (file: File) => void;
  t: QuickPostT;
}) {
  const inputId = "lead-media-upload";

  if (selected) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
        <div className="flex items-start gap-3">
          {selected.signedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={selected.signedUrl}
              alt={selected.label ?? selected.fileName ?? t("image.selected_fallback_alt")}
              className="h-20 w-20 shrink-0 rounded-lg object-cover ring-1 ring-gray-200"
            />
          ) : (
            <div className="h-20 w-20 shrink-0 rounded-lg bg-gray-200" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">
              {selected.label ?? selected.fileName ?? t("image.attached_fallback")}
            </div>
            <div className="text-xs text-gray-500">
              {selected.contentType ?? t("image.image_label_fallback")}
              {selected.sizeBytes != null
                ? ` · ${formatBytes(selected.sizeBytes)}`
                : ""}
            </div>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={onOpenLibrary}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("image.change")}
              </button>
              <button
                type="button"
                onClick={onClear}
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {t("image.remove")}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showLibrary) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">{t("image.your_library")}</h3>
          <button
            type="button"
            onClick={onCloseLibrary}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            {t("image.library_close")}
          </button>
        </div>
        {libraryError ? (
          <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {libraryError}
          </p>
        ) : libraryLoading ? (
          <p className="text-xs text-gray-500">{t("image.library_loading")}</p>
        ) : library.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center">
            <p className="text-xs text-gray-500">{t("image.library_empty")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {library.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m)}
                className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100 hover:border-blue-400"
                title={m.label ?? m.fileName ?? t("image.library_image_alt_fallback")}
              >
                {m.signedUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.signedUrl}
                    alt={m.label ?? m.fileName ?? t("image.library_image_alt_fallback")}
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                  />
                ) : null}
              </button>
            ))}
          </div>
        )}

        <label
          htmlFor={inputId}
          className="block cursor-pointer rounded-lg border-2 border-dashed border-gray-300 bg-gray-50/60 px-3 py-3 text-center text-xs text-gray-600 hover:border-blue-400 hover:bg-blue-50/30"
        >
          {uploading ? t("image.upload_busy") : t("image.upload_label")}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }

  // Compact "Add an image" prompt.
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onUpload(f);
      }}
      className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-3 py-2.5 text-xs"
    >
      <span className="text-gray-600">
        <span className="font-medium text-gray-900">{t("image.prompt_prefix_emphasis")}</span>{t("image.prompt_suffix")}
      </span>
      <div className="flex shrink-0 gap-2">
        <label
          htmlFor={inputId}
          className="cursor-pointer rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {uploading ? t("image.upload_busy") : t("image.upload_short")}
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          onClick={onOpenLibrary}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          {t("image.open_library")}
        </button>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function emptyStateMessage(trigger: Trigger, t: QuickPostT): string {
  switch (trigger) {
    case "new_listing":
      return t("empty_subjects.new_listing");
    case "open_house":
      return t("empty_subjects.open_house");
    case "price_drop":
      return t("empty_subjects.price_drop");
    case "just_sold":
      return t("empty_subjects.just_sold");
    default:
      return t("empty_subjects.default");
  }
}
