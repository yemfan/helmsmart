import type { MobileExpenseDto, MobileExpenseTotalsDto } from "@leadsmart/shared";
import { useTranslation } from "react-i18next";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ScreenLoading } from "../components/ScreenLoading";
import { BrandRefreshControl } from "../components/BrandRefreshControl";
import {
  fetchMobileExpenses,
  postMobileExpense,
  deleteMobileExpense,
  uploadMobileReceipt,
  type MobileApiFailure,
} from "../lib/leadsmartMobileApi";
import { useThemeTokens } from "../lib/useThemeTokens";
import type { ThemeTokens } from "../lib/theme";

/** $1,234.50 — Hermes ships Intl, but guard with a manual fallback. */
function money(n: number): string {
  const v = Number(n) || 0;
  try {
    return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch {
    return `$${v.toFixed(2)}`;
  }
}

function todayLocalIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ExpensesScreen() {
  const { t } = useTranslation("mobile_misc_screens");
  const tokens = useThemeTokens();
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  const [expenses, setExpenses] = useState<MobileExpenseDto[]>([]);
  const [month, setMonth] = useState<MobileExpenseTotalsDto>({ total: 0, count: 0, byCategory: [] });
  const [year, setYear] = useState<MobileExpenseTotalsDto>({ total: 0, count: 0, byCategory: [] });
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<MobileApiFailure | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("");
  const [expenseDate, setExpenseDate] = useState(todayLocalIso());
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async (mode: "full" | "refresh") => {
    if (mode === "full") {
      setLoading(true);
      setError(null);
    }
    if (mode === "refresh") setRefreshing(true);

    const res = await fetchMobileExpenses();

    if (mode === "full") setLoading(false);
    if (mode === "refresh") setRefreshing(false);

    if (res.ok === false) {
      setError(res);
      return;
    }
    setExpenses(res.expenses);
    setMonth(res.totals.month);
    setYear(res.totals.year);
    setCategories(res.categories);
    setError(null);
  }, []);

  // Effective category: the user's pick, falling back to the first
  // known category. Derived (not stored) so picking a chip never
  // churns `load`'s identity and re-triggers the focus effect.
  const selectedCategory = category || categories[0] || "";

  useFocusEffect(
    useCallback(() => {
      void load("full");
    }, [load])
  );

  const onRefresh = useCallback(() => {
    void load("refresh");
  }, [load]);

  function resetForm() {
    setAmount("");
    setCategory("");
    setExpenseDate(todayLocalIso());
    setVendor("");
    setNotes("");
    setReceiptUrl(null);
    setReceiptUri(null);
    setFormError(null);
  }

  const doUpload = useCallback(async (result: ImagePicker.ImagePickerResult) => {
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    setReceiptUri(asset.uri);
    setUploadingReceipt(true);
    setFormError(null);
    const up = await uploadMobileReceipt({
      uri: asset.uri,
      fileName: asset.fileName ?? undefined,
      contentType: asset.mimeType ?? "image/jpeg",
    });
    setUploadingReceipt(false);
    if (up.ok === false) {
      setReceiptUri(null);
      setFormError(`Couldn't attach receipt: ${up.message}. You can still save the expense.`);
      return;
    }
    setReceiptUrl(up.url);
  }, []);

  const attachReceipt = useCallback(() => {
    Alert.alert(t("expenses.addAReceipt"), t("expenses.attachAPhotoOfThe"), [
      {
        text: "Take photo",
        onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            setFormError("Camera permission denied.");
            return;
          }
          await doUpload(await ImagePicker.launchCameraAsync({ quality: 0.7 }));
        },
      },
      {
        text: "Choose from library",
        onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            setFormError("Photo library permission denied.");
            return;
          }
          await doUpload(
            await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.7,
            })
          );
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [doUpload]);

  const submit = useCallback(async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError("Enter an amount greater than zero.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const res = await postMobileExpense({
      amount: amt,
      category: selectedCategory || undefined,
      vendor: vendor || null,
      notes: notes || null,
      expenseDate: expenseDate || null,
      receiptUrl,
    });
    setSaving(false);
    if (res.ok === false) {
      setFormError(res.message);
      return;
    }
    resetForm();
    setShowForm(false);
    void load("refresh");
  }, [amount, selectedCategory, vendor, notes, expenseDate, receiptUrl, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmDelete = useCallback(
    (item: MobileExpenseDto) => {
      Alert.alert(t("expenses.deleteExpense"), `Remove this ${money(item.amount)} expense?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeletingId(item.id);
            const res = await deleteMobileExpense(item.id);
            setDeletingId(null);
            if (res.ok === false) {
              Alert.alert(t("expenses.couldnTDelete"), res.message);
              return;
            }
            void load("refresh");
          },
        },
      ]);
    },
    [load]
  );

  if (loading && expenses.length === 0) {
    return <ScreenLoading message={t("expenses.loadingExpenses")} />;
  }

  if (error && expenses.length === 0) {
    return (
      <View style={styles.centered}>
        <ErrorBanner
          title={t("expenses.unableToLoadExpenses")}
          message={error.message}
          onRetry={() => void load("full")}
        />
      </View>
    );
  }

  const maxCat = year.byCategory.reduce((m, c) => Math.max(m, c.total), 0);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      refreshControl={<BrandRefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Stat cards */}
      <View style={styles.statRow}>
        <View style={[styles.statCard, { backgroundColor: tokens.infoBg }]}>
          <Text style={[styles.statLabel, { color: tokens.infoText }]}>{t("expenses.thisMonth")}</Text>
          <Text style={[styles.statValue, { color: tokens.infoTextDeep }]}>{money(month.total)}</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: tokens.successBg }]}>
          <Text style={[styles.statLabel, { color: tokens.successTextDark }]}>{t("expenses.yearToDate")}</Text>
          <Text style={[styles.statValue, { color: tokens.successText }]}>{money(year.total)}</Text>
        </View>
      </View>

      {/* Log button / form */}
      {!showForm ? (
        <Pressable style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={18} color={tokens.textOnAccent} />
          <Text style={styles.addBtnText}>{t("expenses.logExpense")}</Text>
        </Pressable>
      ) : (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{t("expenses.logABusinessExpense")}</Text>

          <Text style={styles.label}>{t("expenses.amount")}</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="e.g. 49.99"
            placeholderTextColor={tokens.textSubtle}
            autoFocus
          />

          <Text style={styles.label}>{t("expenses.category")}</Text>
          <View style={styles.chipWrap}>
            {categories.map((c) => {
              const active = c === selectedCategory;
              return (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{c}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.formRow}>
            <View style={styles.formCol}>
              <Text style={styles.label}>{t("expenses.date")}</Text>
              <TextInput
                style={styles.input}
                value={expenseDate}
                onChangeText={setExpenseDate}
                placeholder={t("expenses.yyyyMmDd")}
                placeholderTextColor={tokens.textSubtle}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.formCol}>
              <Text style={styles.label}>{t("expenses.vendor")}</Text>
              <TextInput
                style={styles.input}
                value={vendor}
                onChangeText={setVendor}
                placeholder="e.g. Canva, Shell"
                placeholderTextColor={tokens.textSubtle}
              />
            </View>
          </View>

          <Text style={styles.label}>{t("expenses.notesOptional")}</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("expenses.whatWasThisFor")}
            placeholderTextColor={tokens.textSubtle}
            multiline
          />

          {/* Receipt photo */}
          <View style={styles.receiptRow}>
            {receiptUri ? (
              <Image source={{ uri: receiptUri }} style={styles.receiptThumb} />
            ) : null}
            <Pressable style={styles.receiptBtn} onPress={attachReceipt} disabled={uploadingReceipt}>
              {uploadingReceipt ? (
                <ActivityIndicator size="small" color={tokens.accent} />
              ) : (
                <Ionicons
                  name={receiptUrl ? "checkmark-circle" : "camera-outline"}
                  size={18}
                  color={receiptUrl ? tokens.success : tokens.accent}
                />
              )}
              <Text style={styles.receiptBtnText}>
                {uploadingReceipt ? "Uploading…" : receiptUrl ? "Receipt attached" : "Add receipt photo"}
              </Text>
            </Pressable>
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <View style={styles.formActions}>
            <Pressable
              style={styles.cancelBtn}
              onPress={() => {
                resetForm();
                setShowForm(false);
              }}
            >
              <Text style={styles.cancelBtnText}>{t("expenses.cancel")}</Text>
            </Pressable>
            <Pressable style={[styles.submitBtn, saving && styles.btnDisabled]} onPress={() => void submit()} disabled={saving}>
              <Text style={styles.submitBtnText}>{saving ? "Saving…" : "Log expense"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Year-to-date by category */}
      {year.byCategory.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("expenses.yearToDateByCategory")}</Text>
          <View style={styles.breakdownCard}>
            {year.byCategory.map((c) => (
              <View key={c.category} style={styles.breakdownRow}>
                <View style={styles.breakdownHeader}>
                  <Text style={styles.breakdownCat}>{c.category}</Text>
                  <Text style={styles.breakdownAmt}>{money(c.total)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${maxCat > 0 ? Math.max(4, (c.total / maxCat) * 100) : 0}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Expense list */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("expenses.recent")}</Text>
        {expenses.length === 0 ? (
          <EmptyState title={t("expenses.noExpensesYet")} subtitle={t("expenses.logYourFirstBusinessCost")} />
        ) : (
          <View style={styles.listCard}>
            {expenses.map((ex, i) => (
              <View key={ex.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                <View style={styles.rowMain}>
                  <View style={styles.rowTop}>
                    <View style={styles.catPill}>
                      <Text style={styles.catPillText}>{ex.category}</Text>
                    </View>
                    {ex.receipt_url ? (
                      <Ionicons name="receipt-outline" size={14} color={tokens.textSubtle} />
                    ) : null}
                  </View>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {ex.expense_date}
                    {ex.vendor ? ` · ${ex.vendor}` : ""}
                    {ex.notes ? ` · ${ex.notes}` : ""}
                  </Text>
                </View>
                <Text style={styles.rowAmount}>{money(ex.amount)}</Text>
                <Pressable
                  style={styles.deleteBtn}
                  onPress={() => confirmDelete(ex)}
                  disabled={deletingId === ex.id}
                  hitSlop={8}
                >
                  {deletingId === ex.id ? (
                    <ActivityIndicator size="small" color={tokens.textSubtle} />
                  ) : (
                    <Ionicons name="trash-outline" size={18} color={tokens.textSubtle} />
                  )}
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: ThemeTokens) =>
  StyleSheet.create({
    scroll: { flex: 1, backgroundColor: theme.bg },
    scrollContent: { padding: 12, paddingBottom: 40 },
    centered: { flex: 1, backgroundColor: theme.bg, padding: 16, paddingTop: 24 },

    statRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
    statCard: { flex: 1, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14 },
    statLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
    statValue: { fontSize: 20, fontWeight: "800", marginTop: 2 },

    addBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: theme.accent,
      borderRadius: 12,
      paddingVertical: 13,
      marginBottom: 12,
    },
    addBtnText: { color: theme.textOnAccent, fontSize: 15, fontWeight: "700" },

    formCard: {
      backgroundColor: theme.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      marginBottom: 12,
    },
    formTitle: { fontSize: 15, fontWeight: "700", color: theme.text, marginBottom: 8 },
    label: { fontSize: 12, fontWeight: "600", color: theme.textMuted, marginTop: 10, marginBottom: 4 },
    input: {
      backgroundColor: theme.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      color: theme.text,
    },
    inputMultiline: { minHeight: 56, textAlignVertical: "top" },
    formRow: { flexDirection: "row", gap: 10 },
    formCol: { flex: 1 },

    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surfaceMuted,
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    chipActive: { backgroundColor: theme.accent, borderColor: theme.accent },
    chipText: { fontSize: 13, fontWeight: "600", color: theme.textMuted },
    chipTextActive: { color: theme.textOnAccent },

    receiptRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
    receiptThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: theme.surfaceMuted },
    receiptBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    receiptBtnText: { fontSize: 13, fontWeight: "600", color: theme.textSecondary },

    formError: { color: theme.danger, fontSize: 13, marginTop: 10 },
    formActions: { flexDirection: "row", gap: 10, marginTop: 14 },
    cancelBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: theme.border,
    },
    cancelBtnText: { fontSize: 14, fontWeight: "600", color: theme.textMuted },
    submitBtn: {
      flex: 2,
      alignItems: "center",
      paddingVertical: 12,
      borderRadius: 11,
      backgroundColor: theme.accent,
    },
    submitBtnText: { fontSize: 14, fontWeight: "700", color: theme.textOnAccent },
    btnDisabled: { opacity: 0.5 },

    section: { marginTop: 6 },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "800",
      color: theme.textMuted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 8,
      marginTop: 8,
    },

    breakdownCard: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 14,
      gap: 12,
    },
    breakdownRow: { gap: 6 },
    breakdownHeader: { flexDirection: "row", justifyContent: "space-between" },
    breakdownCat: { fontSize: 14, color: theme.textSecondary },
    breakdownAmt: { fontSize: 14, fontWeight: "700", color: theme.text },
    barTrack: { height: 6, borderRadius: 999, backgroundColor: theme.surfaceElevated, overflow: "hidden" },
    barFill: { height: "100%", borderRadius: 999, backgroundColor: theme.accent },

    listCard: {
      backgroundColor: theme.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.border,
      overflow: "hidden",
    },
    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
    rowBorder: { borderTopWidth: 1, borderTopColor: theme.borderSubtle },
    rowMain: { flex: 1, minWidth: 0 },
    rowTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 },
    catPill: {
      backgroundColor: theme.infoBg,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    catPillText: { fontSize: 10, fontWeight: "700", color: theme.infoText, textTransform: "uppercase", letterSpacing: 0.4 },
    rowMeta: { fontSize: 12, color: theme.textSubtle },
    rowAmount: { fontSize: 15, fontWeight: "700", color: theme.text },
    deleteBtn: { padding: 4 },
  });
