import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";
import {
  fetchBossAutopilot,
  fetchBossConversation,
  fetchBossRecommendations,
  fetchBossTeam,
  fetchMobileBriefings,
  patchBossAutopilot,
  patchBossInstructionTask,
  postBossInstruction,
  resolveBossRecommendation,
  type MobileAutopilotCell,
  type MobileAutopilotChannel,
  type MobileAutopilotChannels,
  type MobileBossAssistant,
  type MobileBossInstruction,
  type MobileBossRecommendation,
  type MobileBossTask,
} from "../../lib/leadsmartMobileApi";

/**
 * Boss Assistant — the mobile command center. Mirrors the web
 * (apps/leadsmartai/app/dashboard/boss/BossAssistantClient.tsx): the Boss
 * proposes + initiates actions through the instruction pipeline, asks approval
 * where the autopilot matrix says "ask", and the team's replies thread inline.
 * Talks to the dual-auth /api/dashboard/realtorboss/* routes via bearer token.
 */

const ASSIGNEE_LABEL: Record<string, string> = {
  receptionist: "Receptionist",
  sales_assistant: "Sales Assistant",
  marketing_assistant: "Marketing Assistant",
  transaction_assistant: "Transaction Assistant",
  accountant: "Accountant",
  realtor: "For your review",
  boss_assistant: "Boss",
};
const CHANNEL_LABEL: Record<MobileAutopilotChannel, string> = {
  call: "Call",
  sms: "Text",
  email: "Email",
  social: "Social",
};
const QUICK_COMMANDS = [
  "Text my hot leads a check-in",
  "Draft a just-listed social post",
  "Plan my day",
];

export default function BossScreen() {
  const tokens = useThemeTokens();
  const router = useRouter();
  const s = useMemo(() => createStyles(tokens), [tokens]);

  const [briefingLine, setBriefingLine] = useState<string | null>(null);
  const [recs, setRecs] = useState<MobileBossRecommendation[]>([]);
  const [instructions, setInstructions] = useState<MobileBossInstruction[]>([]);
  const [tasks, setTasks] = useState<MobileBossTask[]>([]);
  const [team, setTeam] = useState<MobileBossAssistant[]>([]);
  const [autopilot, setAutopilot] = useState(false);
  const [cells, setCells] = useState<MobileAutopilotCell[]>([]);
  const [channels, setChannels] = useState<MobileAutopilotChannels[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const teamNames = useMemo(() => {
    const m: Record<string, string> = {};
    for (const a of team) if (a.name) m[a.type] = a.name;
    return m;
  }, [team]);
  const bossName = teamNames["boss_assistant"] || "Boss";

  const loadConversation = useCallback(async () => {
    const res = await fetchBossConversation(8);
    if (res.ok) {
      setInstructions(res.instructions.slice().reverse());
      setTasks(res.tasks);
    }
  }, []);

  const loadAll = useCallback(async () => {
    const [brief, recRes, teamRes, apRes] = await Promise.all([
      fetchMobileBriefings(),
      fetchBossRecommendations(),
      fetchBossTeam(),
      fetchBossAutopilot(),
    ]);
    if (brief.ok) {
      const morning = brief.morning[0];
      setBriefingLine(morning ? morning.headline?.trim() || morning.summary?.split(/[.!?]\s/)[0] || null : null);
    }
    if (recRes.ok) setRecs(recRes.recommendations);
    if (teamRes.ok) setTeam(teamRes.assistants);
    if (apRes.ok) {
      setAutopilot(apRes.global);
      setCells(apRes.cells);
      setChannels(apRes.channels);
    }
    await loadConversation();
    setLoading(false);
  }, [loadConversation]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // Poll while an instruction is still being parsed/routed.
  const hasPending = instructions.some((i) => i.status === "pending" || i.status === "processing");
  useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => void loadConversation(), 4000);
    return () => clearInterval(t);
  }, [hasPending, loadConversation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  }, [loadAll]);

  const submitCommand = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content) return;
      setCommand("");
      const tempId = `temp_${Date.now()}`;
      setInstructions((prev) => [
        ...prev,
        { id: tempId, content, status: "processing", created_at: new Date().toISOString() },
      ]);
      await postBossInstruction(content);
      await loadConversation();
    },
    [loadConversation],
  );

  const handleProposal = useCallback(
    async (rec: MobileBossRecommendation) => {
      setRecs((prev) => prev.filter((r) => r.id !== rec.id));
      const cmd = rec.recommended_action && rec.recommended_action.length > 3 ? rec.recommended_action : rec.title;
      await Promise.all([submitCommand(cmd), resolveBossRecommendation(rec.id, "completed")]);
    },
    [submitCommand],
  );

  const dismissProposal = useCallback(async (id: string) => {
    setRecs((prev) => prev.filter((r) => r.id !== id));
    await resolveBossRecommendation(id, "dismissed");
  }, []);

  const setGlobal = useCallback(async (on: boolean) => {
    setAutopilot(on);
    await patchBossAutopilot({ global: on });
  }, []);

  const setCell = useCallback(async (assignee: string, channel: MobileAutopilotChannel, mode: "ask" | "auto") => {
    setCells((prev) => [...prev.filter((c) => !(c.assignee === assignee && c.channel === channel)), { assignee, channel, mode }]);
    await patchBossAutopilot({ assignee, channel, mode });
  }, []);

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  })();

  return (
    <SafeAreaView style={s.flex} edges={["bottom"]}>
      <ScrollView
        style={s.flex}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.accent} />}
      >
        {/* Header: identity + autopilot + settings */}
        <View style={s.headerRow}>
          <View style={s.identity}>
            <View style={s.bossAvatar}>
              <Ionicons name="sparkles" size={18} color={tokens.textOnAccent} />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={s.bossName}>{bossName}</Text>
              <Text style={s.bossSub}>your AI chief of staff</Text>
            </View>
          </View>
          <View style={s.headerActions}>
            <Pressable
              onPress={() => void setGlobal(!autopilot)}
              style={[s.autoPill, autopilot ? s.autoPillOn : s.autoPillOff]}
              accessibilityRole="switch"
              accessibilityState={{ checked: autopilot }}
            >
              <Ionicons name={autopilot ? "airplane" : "airplane-outline"} size={13} color={autopilot ? tokens.successTextDark : tokens.textMuted} />
              <Text style={[s.autoPillText, { color: autopilot ? tokens.successTextDark : tokens.textMuted }]}>
                {autopilot ? "Autopilot on" : "Autopilot off"}
              </Text>
            </Pressable>
            <Pressable onPress={() => setSettingsOpen(true)} style={s.gear} accessibilityLabel="Approval settings">
              <Ionicons name="options-outline" size={18} color={tokens.textMuted} />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={tokens.accent} />
          </View>
        ) : (
          <>
            {/* Briefing opener */}
            <BossBubble tokens={tokens} s={s}>
              <Text style={s.bodyText}>
                {greeting}. {briefingLine || "Here's where things stand — and what I'd like to do for you."}
              </Text>
            </BossBubble>

            {/* Proposals */}
            {recs.map((r) => (
              <BossBubble key={r.id} tokens={tokens} s={s}>
                <View style={s.tagWarn}>
                  <Text style={s.tagWarnText}>Proposal</Text>
                </View>
                <Text style={s.cardTitle}>{r.title}</Text>
                {(r.summary || r.reason) ? (
                  <Text style={s.cardSub}>{[r.summary, r.reason].filter(Boolean).join(" — ")}</Text>
                ) : null}
                {r.expected_outcome ? <Text style={s.outcome}>→ {r.expected_outcome}</Text> : null}
                <View style={s.actionRow}>
                  <Pressable style={s.primaryBtn} onPress={() => void handleProposal(r)}>
                    <Text style={s.primaryBtnText}>
                      {r.recommended_action && r.recommended_action.length > 3 ? r.recommended_action : "Have Boss handle it"}
                    </Text>
                  </Pressable>
                  <Pressable style={s.ghostBtn} onPress={() => void dismissProposal(r.id)}>
                    <Text style={s.ghostBtnText}>Not now</Text>
                  </Pressable>
                </View>
              </BossBubble>
            ))}

            {/* Conversation */}
            {instructions.map((ins) => (
              <View key={ins.id}>
                <View style={s.userBubbleRow}>
                  <Text style={s.userBubble}>{ins.content}</Text>
                </View>
                {ins.status === "pending" || ins.status === "processing" ? (
                  <BossBubble tokens={tokens} s={s}>
                    <Text style={s.mutedText}>On it — breaking this into actions…</Text>
                  </BossBubble>
                ) : ins.status === "failed" ? (
                  <BossBubble tokens={tokens} s={s}>
                    <Text style={s.mutedText}>Couldn&apos;t work that one out — try rephrasing it.</Text>
                  </BossBubble>
                ) : (
                  tasks.filter((t) => t.instruction_id === ins.id).length > 0 && (
                    <BossBubble tokens={tokens} s={s}>
                      {tasks
                        .filter((t) => t.instruction_id === ins.id)
                        .map((t) => (
                          <TaskRow key={t.id} task={t} tokens={tokens} s={s} teamNames={teamNames} onChanged={loadConversation} />
                        ))}
                    </BossBubble>
                  )
                )}
              </View>
            ))}

            {recs.length === 0 && instructions.length === 0 ? (
              <BossBubble tokens={tokens} s={s}>
                <Text style={s.bodyText}>Nothing urgent — your team has things under control. Tell me what you&apos;d like done.</Text>
              </BossBubble>
            ) : null}

            {/* Quick commands */}
            <View style={s.chipRow}>
              {QUICK_COMMANDS.map((q) => (
                <Pressable key={q} style={s.chip} onPress={() => void submitCommand(q)}>
                  <Text style={s.chipText}>{q}</Text>
                </Pressable>
              ))}
            </View>

            {/* AI team */}
            {team.filter((a) => a.type !== "boss_assistant").length > 0 ? (
              <View style={s.teamSection}>
                <Text style={s.sectionTitle}>Your AI team</Text>
                {team
                  .filter((a) => a.type !== "boss_assistant")
                  .map((a) => (
                    <View key={a.type} style={s.teamRow}>
                      <View style={[s.teamInitial, { backgroundColor: tokens.infoBg }]}>
                        <Text style={[s.teamInitialText, { color: tokens.infoText }]}>
                          {(teamNames[a.type] || ASSIGNEE_LABEL[a.type] || a.type).slice(0, 1)}
                        </Text>
                      </View>
                      <Text style={s.teamName}>{teamNames[a.type] || ASSIGNEE_LABEL[a.type] || a.type}</Text>
                      <View style={[s.statusDot, { backgroundColor: a.status === "active" ? tokens.success : tokens.textSubtle }]} />
                    </View>
                  ))}
              </View>
            ) : null}

            {/* Offer desk entry */}
            <Pressable style={s.teamSection} onPress={() => router.push("/(tabs)/offer-desk")}>
              <View style={s.teamRow}>
                <View style={[s.teamInitial, { backgroundColor: tokens.infoBg }]}>
                  <Ionicons name="document-text-outline" size={16} color={tokens.infoText} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.teamName}>Offer desk</Text>
                  <Text style={s.bossSub}>Build an offer · review a contract with AI</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={tokens.textSubtle} />
              </View>
            </Pressable>
          </>
        )}
      </ScrollView>

      {/* Command bar */}
      <View style={s.commandBar}>
        <TextInput
          style={s.commandInput}
          value={command}
          onChangeText={setCommand}
          placeholder={autopilot ? "Tell your team what to do — they'll act…" : "Tell your team what to do…"}
          placeholderTextColor={tokens.textSubtle}
          multiline
          onSubmitEditing={() => void submitCommand(command)}
        />
        <Pressable
          style={[s.sendBtn, !command.trim() && { opacity: 0.5 }]}
          disabled={!command.trim()}
          onPress={() => void submitCommand(command)}
          accessibilityLabel="Send"
        >
          <Ionicons name="arrow-up" size={20} color={tokens.textOnAccent} />
        </Pressable>
      </View>

      <SettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        tokens={tokens}
        s={s}
        global={autopilot}
        channels={channels}
        cells={cells}
        onGlobal={setGlobal}
        onCell={setCell}
      />
    </SafeAreaView>
  );
}

function BossBubble({ tokens, s, children }: { tokens: ThemeTokens; s: Styles; children: ReactNode }) {
  return (
    <View style={s.bossRow}>
      <View style={s.bossDot}>
        <Ionicons name="sparkles" size={13} color={tokens.textOnAccent} />
      </View>
      <View style={s.bossBubble}>{children}</View>
    </View>
  );
}

function TaskRow({
  task: t,
  tokens,
  s,
  teamNames,
  onChanged,
}: {
  task: MobileBossTask;
  tokens: ThemeTokens;
  s: Styles;
  teamNames: Record<string, string>;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const done = t.status === "sent" || t.status === "completed" || t.status === "done";

  async function act(action: "approve" | "dismiss" | "answer") {
    if (action === "answer" && !answer.trim()) return;
    setBusy(true);
    setError(null);
    const res = await patchBossInstructionTask(t.id, action, answer.trim());
    setBusy(false);
    if (res.ok === false) {
      setError(res.message);
      return;
    }
    setAnswer("");
    await onChanged();
  }

  const who = teamNames[t.assigned_to] ?? ASSIGNEE_LABEL[t.assigned_to] ?? t.assigned_to;
  const badge = done
    ? { text: "Done", bg: tokens.successBg, fg: tokens.successTextDark }
    : t.status === "needs_input"
      ? { text: "Needs info", bg: tokens.warningBg, fg: tokens.warningText }
      : t.status === "awaiting_approval"
        ? { text: "Awaiting you", bg: tokens.warningBg, fg: tokens.warningText }
        : { text: who, bg: tokens.infoBg, fg: tokens.infoText };

  return (
    <View style={s.taskRow}>
      <View style={s.taskHead}>
        <Text style={s.taskTitle}>
          {done ? "✓ " : t.status === "dismissed" ? "✕ " : ""}
          {t.title}
        </Text>
        <View style={[s.badge, { backgroundColor: badge.bg }]}>
          <Text style={[s.badgeText, { color: badge.fg }]}>{badge.text}</Text>
        </View>
      </View>

      {t.status === "awaiting_approval" && t.draft_body ? (
        <View style={s.draftBox}>
          <Text style={s.draftLabel}>
            Draft {t.draft_channel === "sms" ? "text" : "email"}
            {t.execution_note && !t.execution_note.startsWith("to:") ? ` · ${t.execution_note}` : ""}
          </Text>
          {t.draft_subject ? <Text style={s.draftSubject}>{t.draft_subject}</Text> : null}
          <Text style={s.draftBody}>{t.draft_body}</Text>
          <View style={s.actionRow}>
            <Pressable style={s.primaryBtn} disabled={busy} onPress={() => void act("approve")}>
              <Text style={s.primaryBtnText}>{busy ? "Sending…" : "Approve & send"}</Text>
            </Pressable>
            <Pressable style={s.ghostBtn} disabled={busy} onPress={() => void act("dismiss")}>
              <Text style={s.ghostBtnText}>Dismiss</Text>
            </Pressable>
          </View>
          {error ? <Text style={s.errorText}>{error}</Text> : null}
        </View>
      ) : null}

      {t.status === "needs_input" ? (
        <View style={s.draftBox}>
          <Text style={s.askText}>{t.follow_up_question ?? "I need one more detail to start this."}</Text>
          <View style={s.answerRow}>
            <TextInput
              style={s.answerInput}
              value={answer}
              onChangeText={setAnswer}
              placeholder="Type your answer…"
              placeholderTextColor={tokens.textSubtle}
              editable={!busy}
            />
            <Pressable style={[s.sendSmall, (!answer.trim() || busy) && { opacity: 0.5 }]} disabled={!answer.trim() || busy} onPress={() => void act("answer")}>
              <Text style={s.primaryBtnText}>{busy ? "…" : "Send"}</Text>
            </Pressable>
          </View>
          {error ? <Text style={s.errorText}>{error}</Text> : null}
        </View>
      ) : null}

      {t.status === "completed" && t.execution_note ? <Text style={s.noteText}>{t.execution_note}</Text> : null}
    </View>
  );
}

function SettingsModal({
  visible,
  onClose,
  tokens,
  s,
  global,
  channels,
  cells,
  onGlobal,
  onCell,
}: {
  visible: boolean;
  onClose: () => void;
  tokens: ThemeTokens;
  s: Styles;
  global: boolean;
  channels: MobileAutopilotChannels[];
  cells: MobileAutopilotCell[];
  onGlobal: (on: boolean) => void;
  onCell: (assignee: string, channel: MobileAutopilotChannel, mode: "ask" | "auto") => void;
}) {
  const cellMode = (assignee: string, channel: MobileAutopilotChannel): "ask" | "auto" => {
    const c = cells.find((x) => x.assignee === assignee && x.channel === channel);
    if (c) return c.mode;
    return global ? "auto" : "ask";
  };
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.modalBackdrop}>
        <View style={s.modalSheet}>
          <View style={s.modalHead}>
            <Text style={s.modalTitle}>Approval settings</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={tokens.textMuted} />
            </Pressable>
          </View>
          <Text style={s.modalSub}>Choose where the Boss acts on its own and where it asks first — per assistant, per channel.</Text>
          <ScrollView style={{ maxHeight: 460 }}>
            <View style={s.globalRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.teamName}>Autopilot (all channels)</Text>
                <Text style={s.bossSub}>The master switch. Per-channel choices override it.</Text>
              </View>
              <Switch value={global} onValueChange={onGlobal} />
            </View>
            {channels.map((row) => (
              <View key={row.assignee} style={s.matrixRow}>
                <Text style={s.teamName}>{ASSIGNEE_LABEL[row.assignee] ?? row.assignee}</Text>
                <View style={s.chipRow}>
                  {row.channels.map((ch) => {
                    const mode = cellMode(row.assignee, ch);
                    const on = mode === "auto";
                    return (
                      <Pressable
                        key={ch}
                        style={[s.cellPill, on ? s.cellPillOn : s.cellPillOff]}
                        onPress={() => onCell(row.assignee, ch, on ? "ask" : "auto")}
                      >
                        <Text style={[s.cellPillText, { color: on ? tokens.successTextDark : tokens.textMuted }]}>
                          {CHANNEL_LABEL[ch]}: {on ? "auto" : "ask"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>
          <Pressable style={[s.primaryBtn, { alignSelf: "flex-end", marginTop: 12 }]} onPress={onClose}>
            <Text style={s.primaryBtnText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

type Styles = ReturnType<typeof createStyles>;

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingBottom: 24, gap: 10 },
    headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
    identity: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
    bossAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    bossName: { fontSize: 17, fontWeight: "700", color: t.text },
    bossSub: { fontSize: 12, color: t.textMuted },
    headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    autoPill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
    autoPillOn: { backgroundColor: t.successBg },
    autoPillOff: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
    autoPillText: { fontSize: 12, fontWeight: "600" },
    gear: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
    loadingBox: { paddingVertical: 40, alignItems: "center" },
    bossRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
    bossDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: t.accent, alignItems: "center", justifyContent: "center", marginTop: 2 },
    bossBubble: { flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, borderTopLeftRadius: 4, padding: 12 },
    bodyText: { fontSize: 14, color: t.text, lineHeight: 20 },
    mutedText: { fontSize: 14, color: t.textMuted },
    noteText: { fontSize: 12, color: t.textMuted, marginTop: 4 },
    tagWarn: { alignSelf: "flex-start", backgroundColor: t.warningBg, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 6 },
    tagWarnText: { fontSize: 10, fontWeight: "700", color: t.warningText, textTransform: "uppercase" },
    cardTitle: { fontSize: 14, fontWeight: "600", color: t.text },
    cardSub: { fontSize: 12, color: t.textMuted, marginTop: 2 },
    outcome: { fontSize: 12, fontWeight: "600", color: t.warning, marginTop: 2 },
    actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" },
    primaryBtn: { backgroundColor: t.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
    primaryBtnText: { color: t.textOnAccent, fontSize: 13, fontWeight: "700" },
    ghostBtn: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
    ghostBtnText: { color: t.textMuted, fontSize: 13, fontWeight: "600" },
    userBubbleRow: { alignItems: "flex-end", marginVertical: 6 },
    userBubble: { maxWidth: "85%", backgroundColor: t.accent, color: t.textOnAccent, borderRadius: 14, borderTopRightRadius: 4, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, overflow: "hidden" },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    chip: { backgroundColor: t.surfaceElevated, borderWidth: 1, borderColor: t.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
    chipText: { fontSize: 12, color: t.textSecondary },
    teamSection: { marginTop: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 12, gap: 8 },
    sectionTitle: { fontSize: 14, fontWeight: "700", color: t.text, marginBottom: 2 },
    teamRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    teamInitial: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
    teamInitialText: { fontSize: 13, fontWeight: "700" },
    teamName: { fontSize: 14, fontWeight: "600", color: t.text, flex: 1 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    taskRow: { borderWidth: 1, borderColor: t.borderSubtle, backgroundColor: t.surfaceMuted, borderRadius: 10, padding: 10, marginBottom: 8 },
    taskHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 },
    taskTitle: { flex: 1, fontSize: 14, color: t.text },
    badge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { fontSize: 10, fontWeight: "700" },
    draftBox: { marginTop: 8, backgroundColor: t.warningBg, borderWidth: 1, borderColor: t.warningBorder, borderRadius: 10, padding: 10 },
    draftLabel: { fontSize: 10, fontWeight: "700", color: t.warningText, textTransform: "uppercase" },
    draftSubject: { fontSize: 13, fontWeight: "600", color: t.text, marginTop: 4 },
    draftBody: { fontSize: 13, color: t.textSecondary, marginTop: 4, lineHeight: 18 },
    askText: { fontSize: 13, color: t.warningText },
    answerRow: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "center" },
    answerInput: { flex: 1, borderWidth: 1, borderColor: t.warningBorder, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: t.text, backgroundColor: t.surface },
    sendSmall: { backgroundColor: t.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    errorText: { fontSize: 12, color: t.danger, marginTop: 6 },
    commandBar: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface },
    commandInput: { flex: 1, maxHeight: 110, minHeight: 40, borderWidth: 1, borderColor: t.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: t.text, backgroundColor: t.bg },
    sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    modalSheet: { backgroundColor: t.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 32 },
    modalHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    modalTitle: { fontSize: 17, fontWeight: "700", color: t.text },
    modalSub: { fontSize: 12, color: t.textMuted, marginTop: 4, marginBottom: 12 },
    globalRow: { flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, marginBottom: 10 },
    matrixRow: { borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, marginBottom: 8, gap: 8 },
    cellPill: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
    cellPillOn: { backgroundColor: t.successBg },
    cellPillOff: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border },
    cellPillText: { fontSize: 11, fontWeight: "600" },
  });
