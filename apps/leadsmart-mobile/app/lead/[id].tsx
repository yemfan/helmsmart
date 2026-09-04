import type {
  MobileBookingLinkDto,
  MobileCalendarEventDto,
  MobileCallDto,
  MobileEmailMessageDto,
  MobileLeadPipelineDto,
  MobileLeadRecordDto,
  MobileLeadTaskDto,
  MobilePipelineSlug,
  MobilePipelineStageOptionDto,
  MobileSmsMessageDto,
} from "@leadsmart/shared";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { EmptyState } from "../../components/EmptyState";
import { ErrorBanner } from "../../components/ErrorBanner";
import { BrandRefreshControl } from "../../components/BrandRefreshControl";
import { FadeIn } from "../../components/Reveal";
import {
  hapticError,
  hapticSelectionChange,
  hapticSuccess,
  hapticWarning,
} from "../../lib/haptics";
import { LeadQuickActionsRow } from "../../components/lead/LeadQuickActionsRow";
import { LeadReplySection } from "../../components/lead/LeadReplySection";
import { PipelineBreadcrumb } from "../../components/lead/PipelineBreadcrumb";
import { ScreenLoading } from "../../components/ScreenLoading";
import { AppointmentCard } from "../../components/calendar/AppointmentCard";
import { AppointmentComposerModal } from "../../components/calendar/AppointmentComposerModal";
import { BookingLinkCard } from "../../components/calendar/BookingLinkCard";
import { BookingLinkComposerModal } from "../../components/calendar/BookingLinkComposerModal";
import { PipelineStagePicker } from "../../components/tasks/PipelineStagePicker";
import { TaskCard } from "../../components/tasks/TaskCard";
import { TaskComposerModal } from "../../components/tasks/TaskComposerModal";
import { formatShortDateTime } from "../../lib/format";
import { leadField } from "../../lib/leadRecord";
import { getDemoLeadRecord, getDemoSmsThread, isDemoLeadId } from "../../lib/demoLead";
import {
  fetchMobileLeadDetail,
  patchLeadPipelineStage,
  patchMobileCalendarEvent,
  patchMobileTask,
} from "../../lib/leadsmartMobileApi";
import type { MobileApiFailure } from "../../lib/leadsmartMobileApi";
import { useLeadDetailRealtime } from "../../lib/realtime/useLeadDetailRealtime";
import { useThemeTokens } from "../../lib/useThemeTokens";
import type { ThemeTokens } from "../../lib/theme";
import { useCachedFetch } from "../../lib/offline/useCachedFetch";
import { useNetwork } from "../../lib/offline/NetworkContext";
import { useWriteQueue } from "../../lib/offline/useWriteQueue";

const emptyPipeline: MobileLeadPipelineDto = {
  stage_id: null,
  mobile_slug: null,
  name: null,
};

/**
 * Builds the hero subtitle: `{tier} • {role} • {stage}` (or the
 * locale's equivalent ordering — i18next can rewrite the format
 * later if word order needs to flip).
 *
 * `t` is the caller's `useTranslation("lead_detail")` t function.
 * Static fallbacks (Lead / Buyer / New) come from JSON so they
 * translate alongside the rest of the screen.
 */
type LeadDetailT = (key: string, options?: Record<string, unknown>) => string;

function buildLeadSubtitle(
  lead: MobileLeadRecordDto,
  pipeline: MobileLeadPipelineDto,
  t: LeadDetailT,
): string {
  const rating = leadField(lead, "rating");
  const hot = rating.toLowerCase() === "hot";
  const tier = hot ? t("subtitle.tier_hot") : t("subtitle.tier_normal");
  const rawIntent = typeof lead.ai_intent === "string" ? lead.ai_intent.trim() : "";
  const role =
    (rawIntent ? rawIntent.split(/[—–-]/)[0]?.trim() : "") ||
    leadField(lead, "buyer_seller")?.trim() ||
    t("subtitle.role_buyer");
  const stage =
    pipeline.name?.trim() ||
    leadField(lead, "lead_status")?.trim() ||
    t("subtitle.stage_new");
  return `${tier} • ${role} • ${stage}`;
}

function mergeConversation(
  sms: MobileSmsMessageDto[],
  email: MobileEmailMessageDto[],
  calls: MobileCallDto[]
): ThreadRow[] {
  const rows: ThreadRow[] = [];
  for (const m of sms) rows.push({ key: `s-${m.id}`, kind: "sms", m });
  for (const m of email) rows.push({ key: `e-${m.id}`, kind: "email", m });
  // Calls thread beside texts and email, as on the web: the AI summary is the
  // body. Without them, tapping a call in the inbox opened a lead with no
  // call on it.
  for (const m of calls) rows.push({ key: `c-${m.id}`, kind: "call", m });
  rows.sort((a, b) => new Date(a.m.created_at).getTime() - new Date(b.m.created_at).getTime());
  return rows;
}

type ThreadRow =
  | { key: string; kind: "sms"; m: MobileSmsMessageDto }
  | { key: string; kind: "email"; m: MobileEmailMessageDto }
  | { key: string; kind: "call"; m: MobileCallDto };

/** Call length as m:ss. Locale-neutral, so it needs no translated string. */
function callLength(seconds: number | null | undefined): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/**
 * AI Insights card — surfaces the lead-scoring AI breakdown
 * (`contact_scores` joined into the mobile DTO). Hidden entirely
 * when there's no score yet — the row is created the first time
 * the agent opens a lead detail post-#419's leadScoring fix, so
 * older leads may not have one until the next rescore tick.
 *
 * Score band → color:
 *   ≥ 70: hot (red)
 *   40-69: warm (amber)
 *   < 40: cold (slate)
 *
 * Reasons are shown inline (up to 3) with a "+N more" link if
 * there's more, expanding inline. Keeps the card compact by
 * default since lead detail already has a lot below it.
 */
function AiInsightsCard({
  lead,
  styles,
}: {
  lead: MobileLeadRecordDto;
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useTranslation("lead_detail");
  const [expanded, setExpanded] = useState(false);
  const rawScore = (lead as { ai_lead_score?: number | null }).ai_lead_score;
  const score = typeof rawScore === "number" ? Math.round(rawScore) : null;
  const intent = (lead as { ai_intent?: string | null }).ai_intent ?? null;
  const timeline = (lead as { ai_timeline?: string | null }).ai_timeline ?? null;
  const confidence = (lead as { ai_confidence?: number | null }).ai_confidence ?? null;
  const explanation =
    ((lead as { ai_explanation?: string[] }).ai_explanation ?? []).filter(
      (s) => typeof s === "string" && s.trim().length > 0,
    );

  // Bail entirely when there's nothing meaningful to show. Avoid
  // surfacing a fake "0 / 100" for leads that simply haven't been
  // scored yet.
  if (score === null && !intent && !timeline && explanation.length === 0) {
    return null;
  }

  const band =
    score == null
      ? "unknown"
      : score >= 70
        ? "hot"
        : score >= 40
          ? "warm"
          : "cold";

  const bandColor = (() => {
    if (band === "hot") return { bg: "#FEE2E2", fg: "#B91C1C" };
    if (band === "warm") return { bg: "#FEF3C7", fg: "#92400E" };
    if (band === "cold") return { bg: "#E5E7EB", fg: "#374151" };
    return { bg: "#F3F4F6", fg: "#6B7280" };
  })();

  const bandLabel = t(`ai_insights.band.${band}`);

  const visibleReasons = expanded ? explanation : explanation.slice(0, 3);

  return (
    <View style={styles.aiCard}>
      <View style={styles.aiHeader}>
        <Text style={styles.aiHeaderLabel}>{t("ai_insights.title")}</Text>
        <View
          style={[styles.aiBandPill, { backgroundColor: bandColor.bg }]}
        >
          <Text style={[styles.aiBandPillText, { color: bandColor.fg }]}>
            {bandLabel}
          </Text>
        </View>
      </View>

      <View style={styles.aiScoreRow}>
        {score !== null ? (
          <View style={styles.aiScoreBlock}>
            <Text style={styles.aiScoreNumber}>{score}</Text>
            <Text style={styles.aiScoreMax}>{t("ai_insights.score_max")}</Text>
          </View>
        ) : (
          <Text style={styles.aiScorePending}>{t("ai_insights.score_pending")}</Text>
        )}

        <View style={styles.aiFactsBlock}>
          {intent ? (
            <Text style={styles.aiFact}>
              <Text style={styles.aiFactLabel}>{t("ai_insights.intent")}</Text>
              <Text style={styles.aiFactValue}>{intent}</Text>
            </Text>
          ) : null}
          {timeline ? (
            <Text style={styles.aiFact}>
              <Text style={styles.aiFactLabel}>{t("ai_insights.timeline")}</Text>
              <Text style={styles.aiFactValue}>{timeline}</Text>
            </Text>
          ) : null}
          {confidence !== null ? (
            <Text style={styles.aiFact}>
              <Text style={styles.aiFactLabel}>{t("ai_insights.confidence")}</Text>
              <Text style={styles.aiFactValue}>
                {Math.round(confidence * 100)}%
              </Text>
            </Text>
          ) : null}
        </View>
      </View>

      {explanation.length > 0 ? (
        <View style={styles.aiReasons}>
          {visibleReasons.map((r, i) => (
            <View key={i} style={styles.aiReasonRow}>
              <Text style={styles.aiReasonBullet}>·</Text>
              <Text style={styles.aiReasonText}>{r}</Text>
            </View>
          ))}
          {explanation.length > 3 ? (
            <Pressable
              onPress={() => setExpanded((v) => !v)}
              style={styles.aiMoreLink}
            >
              <Text style={styles.aiMoreLinkText}>
                {expanded
                  ? t("ai_insights.show_less")
                  : t("ai_insights.more_reasons", {
                      count: explanation.length - 3,
                    })}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MessageBubble({
  row,
  styles,
}: {
  row: ThreadRow;
  styles: ReturnType<typeof createStyles>;
}) {
  const { t } = useTranslation("lead_detail");
  const inbound = row.m.direction === "inbound";
  const subject = row.kind === "email" && row.m.subject ? row.m.subject : null;
  const channel =
    row.kind === "sms"
      ? t("bubble.channel_sms")
      : row.kind === "call"
        ? t("bubble.channel_call")
        : t("bubble.channel_email");
  // A call with no summary shows the empty marker, not invented filler.
  const body = row.kind === "call" ? row.m.summary : row.m.message;
  const length = row.kind === "call" ? callLength(row.m.duration_seconds) : null;
  return (
    <View style={[styles.bubbleWrap, inbound ? styles.bubbleInbound : styles.bubbleOutbound]}>
      <Text style={styles.bubbleChannel}>{channel}</Text>
      {subject ? <Text style={styles.bubbleSubject}>{subject}</Text> : null}
      <Text style={styles.bubbleBody}>{body || t("bubble.empty_body")}</Text>
      <Text style={styles.bubbleMeta}>
        {inbound ? t("bubble.inbound") : t("bubble.outbound")} · {formatShortDateTime(row.m.created_at)}
        {length ? ` · ${length}` : ""}
      </Text>
    </View>
  );
}

export default function LeadDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);
  const { t } = useTranslation("lead_detail");
  const SectionRule = () => <View style={styles.sectionRule} />;
  const leadId = typeof id === "string" ? id : Array.isArray(id) ? id[0] : "";

  const { isConnected } = useNetwork();
  const { queueWrite } = useWriteQueue();

  const [lead, setLead] = useState<MobileLeadRecordDto | null>(null);
  const [sms, setSms] = useState<MobileSmsMessageDto[]>([]);
  const [email, setEmail] = useState<MobileEmailMessageDto[]>([]);
  const [calls, setCalls] = useState<MobileCallDto[]>([]);
  const [pipeline, setPipeline] = useState<MobileLeadPipelineDto>(emptyPipeline);
  const [pipelineStages, setPipelineStages] = useState<MobilePipelineStageOptionDto[]>([]);
  const [nextOpenTask, setNextOpenTask] = useState<MobileLeadTaskDto | null>(null);
  const [nextAppointment, setNextAppointment] = useState<MobileCalendarEventDto | null>(null);
  const [bookingLinks, setBookingLinks] = useState<MobileBookingLinkDto[]>([]);
  const [pipelineBusySlug, setPipelineBusySlug] = useState<MobilePipelineSlug | null>(null);
  const [nextTaskCompleting, setNextTaskCompleting] = useState(false);
  const [pipelineActionError, setPipelineActionError] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [bookingLinkModalOpen, setBookingLinkModalOpen] = useState(false);
  const [appointmentCancelling, setAppointmentCancelling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Demo leads bypass the cache entirely
  const isDemo = isDemoLeadId(leadId);

  type LeadDetailPayload = {
    lead: MobileLeadRecordDto;
    sms: MobileSmsMessageDto[];
    email: MobileEmailMessageDto[];
    pipeline: MobileLeadPipelineDto;
    pipeline_stages: MobilePipelineStageOptionDto[];
    next_open_task: MobileLeadTaskDto | null;
    next_appointment: MobileCalendarEventDto | null;
    booking_links: MobileBookingLinkDto[];
    /** Missing from payloads cached by builds before 1.7.0. */
    calls?: MobileCallDto[];
  };

  const detailFetcher = useCallback(async (): Promise<LeadDetailPayload | MobileApiFailure> => {
    if (!leadId) return { ok: false, status: 0, message: "Missing lead id." } as MobileApiFailure;
    const res = await fetchMobileLeadDetail(leadId);
    if (res.ok === false) return res;
    return {
      lead: res.lead,
      sms: res.conversations.sms,
      email: res.conversations.email,
      calls: res.conversations.calls ?? [],
      pipeline: res.pipeline,
      pipeline_stages: res.pipeline_stages,
      next_open_task: res.next_open_task,
      next_appointment: res.next_appointment,
      booking_links: res.booking_links,
    };
  }, [leadId]);

  const {
    data: cachedDetail,
    loading: cacheLoading,
    error: cacheError,
    refresh: cacheRefresh,
  } = useCachedFetch<LeadDetailPayload>(
    "lead:" + leadId,
    detailFetcher,
    { enabled: !!leadId && !isDemo }
  );

  // Sync cached data into local state
  const prevDetail = useRef(cachedDetail);
  useEffect(() => {
    if (cachedDetail && cachedDetail !== prevDetail.current) {
      setLead(cachedDetail.lead);
      setSms(cachedDetail.sms);
      setEmail(cachedDetail.email);
      setCalls(cachedDetail.calls ?? []);
      setPipeline(cachedDetail.pipeline);
      setPipelineStages(cachedDetail.pipeline_stages);
      setNextOpenTask(cachedDetail.next_open_task);
      setNextAppointment(cachedDetail.next_appointment);
      setBookingLinks(cachedDetail.booking_links);
      setPipelineActionError(null);
      setScheduleError(null);
    }
    prevDetail.current = cachedDetail;
  }, [cachedDetail]);

  // Handle demo lead
  useEffect(() => {
    if (!isDemo) return;
    setLead(getDemoLeadRecord());
    setSms(getDemoSmsThread());
    setEmail([]);
    setCalls([]);
    setPipeline(emptyPipeline);
    setPipelineStages([]);
    setNextOpenTask(null);
    setNextAppointment(null);
    setBookingLinks([]);
  }, [isDemo]);

  const loading = isDemo ? false : cacheLoading && !cachedDetail;
  const error = isDemo ? null : cacheError;

  const silentRefresh = useCallback(async () => {
    if (!leadId || isDemoLeadId(leadId)) return;
    const res = await fetchMobileLeadDetail(leadId);
    if (res.ok === false) return;
    setLead(res.lead);
    setSms(res.conversations.sms);
    setEmail(res.conversations.email);
    setCalls(res.conversations.calls ?? []);
    setPipeline(res.pipeline);
    setPipelineStages(res.pipeline_stages);
    setNextOpenTask(res.next_open_task);
    setNextAppointment(res.next_appointment);
    setBookingLinks(res.booking_links);
  }, [leadId]);

  useLeadDetailRealtime(
    leadId,
    silentRefresh,
    Boolean(leadId) && !isDemoLeadId(leadId) && !loading
  );

  useLayoutEffect(() => {
    if (!lead) return;
    const title = leadField(lead, "name") || t("lead_fallback", { id: lead.id });
    navigation.setOptions({ title });
  }, [lead, navigation, t]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    cacheRefresh();
    setTimeout(() => setRefreshing(false), 600);
  }, [cacheRefresh]);

  const onSelectPipelineStage = useCallback(
    async (slug: MobilePipelineSlug) => {
      if (!leadId || isDemoLeadId(leadId)) return;
      // Selection tick on pick — fires immediately so the
      // breadcrumb stage feels responsive even while the API
      // call is in flight.
      hapticSelectionChange();
      setPipelineActionError(null);

      if (!isConnected) {
        await queueWrite("pipeline-stage", [leadId, slug]);
        // Optimistic local update
        const stage = pipelineStages.find((s) => s.mobile_slug === slug);
        setPipeline({
          stage_id: null,
          mobile_slug: slug,
          name: stage?.name ?? null,
        });
        return;
      }

      setPipelineBusySlug(slug);
      const res = await patchLeadPipelineStage(leadId, { stage_slug: slug });
      setPipelineBusySlug(null);
      if (res.ok === false) {
        hapticError();
        setPipelineActionError(res.message);
        return;
      }
      const stage = pipelineStages.find((s) => s.mobile_slug === slug);
      setPipeline({
        stage_id: res.pipeline_stage_id,
        mobile_slug: slug,
        name: stage?.name ?? null,
      });
    },
    [leadId, pipelineStages, isConnected, queueWrite]
  );

  const onCompleteNextTask = useCallback(async () => {
    if (!nextOpenTask || !leadId || isDemoLeadId(leadId)) return;
    setPipelineActionError(null);
    setNextTaskCompleting(true);
    const res = await patchMobileTask(nextOpenTask.id, { status: "done" });
    setNextTaskCompleting(false);
    if (res.ok === false) {
      hapticError();
      setPipelineActionError(res.message);
      return;
    }
    // Success pattern fires once the task is actually persisted
    // — not optimistically — so the user knows the state is real.
    hapticSuccess();
    await silentRefresh();
  }, [nextOpenTask, leadId, silentRefresh]);

  const onCancelNextAppointment = useCallback(async () => {
    if (!nextAppointment || !leadId || isDemoLeadId(leadId)) return;
    hapticWarning();
    setScheduleError(null);
    setAppointmentCancelling(true);
    const res = await patchMobileCalendarEvent(nextAppointment.id, { status: "cancelled" });
    setAppointmentCancelling(false);
    if (res.ok === false) {
      hapticError();
      setScheduleError(res.message);
      return;
    }
    await silentRefresh();
  }, [nextAppointment, leadId, silentRefresh]);

  if (loading) {
    return <ScreenLoading message={t("loading")} />;
  }

  if (error || !lead) {
    return (
      <View style={styles.centered}>
        <ErrorBanner
          title={t("error.title")}
          message={error?.message ?? t("error.not_found")}
          onRetry={cacheRefresh}
        />
      </View>
    );
  }

  const name = leadField(lead, "name") || t("lead_fallback", { id: lead.id });
  const subtitle = buildLeadSubtitle(lead, pipeline, t);
  const lastActivity = leadField(lead, "last_activity_at");
  const mergedThread = mergeConversation(sms, email, calls);

  return (
    <KeyboardAvoidingView
      style={styles.kav}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <FadeIn>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {isDemoLeadId(lead.id) ? (
          <View style={styles.demoBanner}>
            <Text style={styles.demoBannerText}>{t("demo_banner")}</Text>
          </View>
        ) : null}

        <View style={styles.hero}>
          <Text style={styles.heroName}>{name}</Text>
          <Text style={styles.heroSubtitle}>{subtitle}</Text>
          {!isDemoLeadId(lead.id) && lastActivity ? (
            <Text style={styles.heroMeta}>
              {t("last_activity", { date: formatShortDateTime(lastActivity) })}
            </Text>
          ) : null}
          {!isDemoLeadId(lead.id) && lead.display_phone ? (
            <Text style={styles.heroLine}>{lead.display_phone}</Text>
          ) : null}
          {!isDemoLeadId(lead.id) && leadField(lead, "email") ? (
            <Text style={styles.heroLine}>{leadField(lead, "email")}</Text>
          ) : null}
        </View>

        <SectionRule />

        <AiInsightsCard lead={lead} styles={styles} />

        <LeadQuickActionsRow
          toolbar
          leadId={lead.id}
          displayPhone={lead.display_phone}
          email={leadField(lead, "email")}
          leadName={leadField(lead, "name") || undefined}
        />

        <SectionRule />

        <Text style={styles.blockHeading}>{t("sections.next_task")}</Text>
        {!isDemoLeadId(lead.id) ? (
          <>
            {pipelineActionError ? <Text style={styles.inlineError}>{pipelineActionError}</Text> : null}
            {nextOpenTask ? (
              <View style={styles.nextTaskCard}>
                <TaskCard
                  variant="compact"
                  task={nextOpenTask}
                  showLeadName={false}
                  onComplete={() => void onCompleteNextTask()}
                  completing={nextTaskCompleting}
                />
              </View>
            ) : (
              <Text style={styles.mutedBlock}>{t("next_task.no_open_task")}</Text>
            )}
            <View style={styles.inlineActions}>
              <Pressable
                onPress={() => setTaskModalOpen(true)}
                style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnPressed]}
              >
                <Text style={styles.linkBtnText}>{t("next_task.add_task")}</Text>
              </Pressable>
              <Pressable
                onPress={() => setAppointmentModalOpen(true)}
                style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnPressed]}
              >
                <Text style={styles.linkBtnText}>{t("next_task.schedule")}</Text>
              </Pressable>
              <Pressable
                onPress={() => setBookingLinkModalOpen(true)}
                style={({ pressed }) => [styles.linkBtn, pressed && styles.linkBtnPressed]}
              >
                <Text style={styles.linkBtnText}>{t("next_task.booking_link")}</Text>
              </Pressable>
            </View>
            {scheduleError ? <Text style={styles.inlineError}>{scheduleError}</Text> : null}
            {nextAppointment ? (
              <View style={styles.compactSchedule}>
                <AppointmentCard
                  variant="compact"
                  event={nextAppointment}
                  onCancel={() => void onCancelNextAppointment()}
                  cancelling={appointmentCancelling}
                />
              </View>
            ) : null}
            {bookingLinks.length > 0 ? (
              <View style={styles.bookingBlock}>
                <Text style={styles.bookingLinksLabel}>{t("next_task.booking_links_label")}</Text>
                {bookingLinks.map((link) => (
                  <BookingLinkCard key={link.id} link={link} compact />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.nextTaskCard}>
            <Text style={styles.nextTaskPrimary}>{t("next_task.demo_task")}</Text>
          </View>
        )}

        <SectionRule />

        <Text style={styles.blockHeading}>{t("sections.pipeline_stage")}</Text>
        {!isDemoLeadId(lead.id) ? (
          <>
            {pipelineActionError ? <Text style={styles.inlineError}>{pipelineActionError}</Text> : null}
            <PipelineBreadcrumb stages={pipelineStages} selectedSlug={pipeline.mobile_slug} />
            <View style={styles.pickerPad}>
              <PipelineStagePicker
                stages={pipelineStages}
                selectedSlug={pipeline.mobile_slug}
                busySlug={pipelineBusySlug ?? undefined}
                onSelect={onSelectPipelineStage}
              />
            </View>
          </>
        ) : (
          <Text style={styles.breadcrumbDemo}>{t("pipeline.demo_breadcrumb")}</Text>
        )}

        <SectionRule />

        <Text style={styles.blockHeading}>{t("sections.conversation")}</Text>
        {mergedThread.length === 0 ? (
          <View style={styles.sectionEmpty}>
            <EmptyState
              title={t("conversation.empty_title")}
              subtitle={t("conversation.empty_sub")}
            />
          </View>
        ) : (
          mergedThread.map((row) => (
            <MessageBubble key={row.key} row={row} styles={styles} />
          ))
        )}
      </ScrollView>
      </FadeIn>
      <LeadReplySection
        leadId={lead.id}
        sms={sms}
        email={email}
        setSms={setSms}
        setEmail={setEmail}
        demo={isDemoLeadId(lead.id)}
      />
      {!isDemoLeadId(lead.id) ? (
        <TaskComposerModal
          visible={taskModalOpen}
          leadId={lead.id}
          onClose={() => setTaskModalOpen(false)}
          onCreated={() => {
            void silentRefresh();
          }}
        />
      ) : null}
      {!isDemoLeadId(lead.id) ? (
        <AppointmentComposerModal
          visible={appointmentModalOpen}
          leadIdFixed={lead.id}
          leadNameFixed={leadField(lead, "name") || undefined}
          onClose={() => setAppointmentModalOpen(false)}
          onCreated={() => {
            void silentRefresh();
          }}
        />
      ) : null}
      {!isDemoLeadId(lead.id) ? (
        <BookingLinkComposerModal
          visible={bookingLinkModalOpen}
          leadId={lead.id}
          onClose={() => setBookingLinkModalOpen(false)}
          onCreated={() => {
            void silentRefresh();
          }}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

const createStyles = (theme: ThemeTokens) => StyleSheet.create({
  kav: { flex: 1, backgroundColor: theme.bg },
  scroll: { flex: 1, backgroundColor: theme.bg },
  scrollContent: { paddingBottom: 28, paddingHorizontal: 16 },
  centered: {
    flex: 1,
    backgroundColor: theme.bg,
    padding: 16,
    justifyContent: "flex-start",
    paddingTop: 24,
  },
  demoBanner: {
    backgroundColor: theme.accentLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.infoBorder,
  },
  demoBannerText: { fontSize: 13, color: theme.infoText, lineHeight: 18 },
  hero: { paddingTop: 4, paddingBottom: 4 },
  heroName: { fontSize: 26, fontWeight: "800", color: theme.text, letterSpacing: -0.3 },
  heroSubtitle: { marginTop: 8, fontSize: 15, fontWeight: "500", color: theme.textMuted, lineHeight: 22 },
  heroMeta: { marginTop: 8, fontSize: 12, color: theme.textSubtle },
  heroLine: { marginTop: 4, fontSize: 15, color: theme.textSecondary },
  sectionRule: {
    height: 1,
    backgroundColor: theme.border,
    marginVertical: 16,
  },
  blockHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: theme.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  aiCard: {
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 14,
    marginBottom: 16,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  aiHeaderLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    color: theme.textSubtle,
  },
  aiBandPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  aiBandPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  aiScoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  aiScoreBlock: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  aiScoreNumber: {
    fontSize: 36,
    fontWeight: "800",
    color: theme.text,
    lineHeight: 38,
  },
  aiScoreMax: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.textSubtle,
    marginLeft: 4,
  },
  aiScorePending: {
    fontSize: 14,
    fontStyle: "italic",
    color: theme.textSubtle,
  },
  aiFactsBlock: {
    flex: 1,
    gap: 2,
  },
  aiFact: {
    fontSize: 13,
    color: theme.text,
    lineHeight: 18,
  },
  aiFactLabel: {
    fontWeight: "700",
    color: theme.textSubtle,
  },
  aiFactValue: {
    fontWeight: "600",
    color: theme.text,
  },
  aiReasons: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    gap: 4,
  },
  aiReasonRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  aiReasonBullet: {
    fontSize: 13,
    color: theme.textSubtle,
    lineHeight: 18,
  },
  aiReasonText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: theme.text,
  },
  aiMoreLink: {
    marginTop: 4,
  },
  aiMoreLinkText: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.accent,
  },
  inlineError: {
    fontSize: 13,
    color: theme.dangerTitle,
    marginBottom: 8,
    marginTop: 4,
  },
  nextTaskCard: {
    marginBottom: 4,
    padding: 14,
    backgroundColor: theme.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  nextTaskPrimary: { fontSize: 17, fontWeight: "700", color: theme.text },
  mutedBlock: { fontSize: 14, color: theme.textMuted, marginBottom: 8 },
  inlineActions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12, marginBottom: 8 },
  linkBtn: { paddingVertical: 6 },
  linkBtnPressed: { opacity: 0.7 },
  linkBtnText: { fontSize: 14, fontWeight: "700", color: theme.accent },
  compactSchedule: { marginTop: 8 },
  bookingBlock: { marginTop: 12 },
  bookingLinksLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.textMuted,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pickerPad: { marginTop: 10 },
  breadcrumbDemo: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.text,
    lineHeight: 22,
  },
  sectionEmpty: { marginVertical: 8 },
  bubbleWrap: {
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    maxWidth: "92%",
  },
  bubbleChannel: {
    fontSize: 10,
    fontWeight: "800",
    color: theme.textSubtle,
    letterSpacing: 0.6,
    marginBottom: 6,
    textTransform: "uppercase",
  },
  bubbleInbound: {
    alignSelf: "flex-start",
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
  },
  bubbleOutbound: {
    alignSelf: "flex-end",
    backgroundColor: theme.infoBg,
    borderWidth: 1,
    borderColor: theme.infoBorder,
  },
  bubbleSubject: { fontSize: 13, fontWeight: "700", color: theme.text, marginBottom: 6 },
  bubbleBody: { fontSize: 15, color: theme.text, lineHeight: 22 },
  bubbleMeta: { marginTop: 8, fontSize: 11, color: theme.textMuted },
});
