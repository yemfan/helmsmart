import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ThemeTokens } from "../../lib/theme";
import { useThemeTokens } from "../../lib/useThemeTokens";
import {
  buildMobileOffer,
  compareListingOffers,
  fetchCompareListings,
  reviewMobileContract,
  type MobileBuiltOffer,
  type MobileCompareListing,
  type MobileContractReview,
  type MobileOfferCompareSummary,
  type MobileOfferForSummary,
} from "../../lib/leadsmartMobileApi";

/**
 * Offer desk (mobile) — three AI tools from the web offer desk:
 *   - Build offer: a form → AI-recommended buyer terms + cover letter.
 *   - Contract review: paste a contract → plain-English review + risk flags.
 *   - Compare offers: pick a listing → net-to-seller per offer + AI recommendation.
 * Talks to the dual-auth offer-desk routes.
 */

const FINANCING = ["cash", "conventional", "fha", "va"] as const;
const HEAT = ["hot", "balanced", "cool"] as const;

function fmtMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export default function OfferDeskScreen() {
  const tokens = useThemeTokens();
  const s = useMemo(() => createStyles(tokens), [tokens]);
  const [tab, setTab] = useState<"build" | "review" | "compare">("build");

  return (
    <SafeAreaView style={s.flex} edges={["bottom"]}>
      <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={s.segment}>
          <SegBtn label="Build" active={tab === "build"} onPress={() => setTab("build")} s={s} />
          <SegBtn label="Review" active={tab === "review"} onPress={() => setTab("review")} s={s} />
          <SegBtn label="Compare" active={tab === "compare"} onPress={() => setTab("compare")} s={s} />
        </View>
        {tab === "build" ? (
          <BuildOffer tokens={tokens} s={s} />
        ) : tab === "review" ? (
          <ContractReview tokens={tokens} s={s} />
        ) : (
          <CompareOffers tokens={tokens} s={s} />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SegBtn({ label, active, onPress, s }: { label: string; active: boolean; onPress: () => void; s: Styles }) {
  return (
    <Pressable onPress={onPress} style={[s.segBtn, active && s.segBtnActive]}>
      <Text style={[s.segBtnText, active && s.segBtnTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Build offer ────────────────────────────────────────────────────

function BuildOffer({ tokens, s }: { tokens: ThemeTokens; s: Styles }) {
  const [address, setAddress] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [buyerMaxBudget, setBuyerMaxBudget] = useState("");
  const [financingType, setFinancingType] = useState<string | null>(null);
  const [marketHeat, setMarketHeat] = useState<"hot" | "balanced" | "cool" | null>(null);
  const [competingOffers, setCompetingOffers] = useState("");
  const [motivation, setMotivation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offer, setOffer] = useState<MobileBuiltOffer | null>(null);

  const num = (v: string) => {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  async function run() {
    const lp = num(listPrice);
    if (!address.trim()) return setError("Property address is required.");
    if (!lp) return setError("A valid list price is required.");
    setBusy(true);
    setError(null);
    setOffer(null);
    const res = await buildMobileOffer({
      address: address.trim(),
      listPrice: lp,
      estimatedValue: num(estimatedValue),
      buyerMaxBudget: num(buyerMaxBudget),
      financingType,
      marketHeat,
      competingOffers: num(competingOffers),
      motivation: motivation.trim() || null,
    });
    setBusy(false);
    if (res.ok === false) return setError(res.message);
    setOffer(res.offer);
  }

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Field label="Property address" s={s}>
        <TextInput style={s.input} value={address} onChangeText={setAddress} placeholder="123 Oak St, Alhambra" placeholderTextColor={tokens.textSubtle} />
      </Field>
      <View style={s.row2}>
        <Field label="List price" s={s} flex>
          <TextInput style={s.input} value={listPrice} onChangeText={setListPrice} placeholder="850000" placeholderTextColor={tokens.textSubtle} keyboardType="numeric" />
        </Field>
        <Field label="CMA value (optional)" s={s} flex>
          <TextInput style={s.input} value={estimatedValue} onChangeText={setEstimatedValue} placeholder="—" placeholderTextColor={tokens.textSubtle} keyboardType="numeric" />
        </Field>
      </View>
      <View style={s.row2}>
        <Field label="Buyer max budget" s={s} flex>
          <TextInput style={s.input} value={buyerMaxBudget} onChangeText={setBuyerMaxBudget} placeholder="—" placeholderTextColor={tokens.textSubtle} keyboardType="numeric" />
        </Field>
        <Field label="Competing offers" s={s} flex>
          <TextInput style={s.input} value={competingOffers} onChangeText={setCompetingOffers} placeholder="0" placeholderTextColor={tokens.textSubtle} keyboardType="numeric" />
        </Field>
      </View>
      <Field label="Financing" s={s}>
        <View style={s.pillRow}>
          {FINANCING.map((f) => (
            <Pressable key={f} style={[s.pill, financingType === f && s.pillOn]} onPress={() => setFinancingType(financingType === f ? null : f)}>
              <Text style={[s.pillText, financingType === f && s.pillTextOn]}>{f}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Market heat" s={s}>
        <View style={s.pillRow}>
          {HEAT.map((h) => (
            <Pressable key={h} style={[s.pill, marketHeat === h && s.pillOn]} onPress={() => setMarketHeat(marketHeat === h ? null : h)}>
              <Text style={[s.pillText, marketHeat === h && s.pillTextOn]}>{h}</Text>
            </Pressable>
          ))}
        </View>
      </Field>
      <Field label="Buyer motivation (optional)" s={s}>
        <TextInput style={[s.input, s.multiline]} value={motivation} onChangeText={setMotivation} placeholder="How badly do they want it? Anything special?" placeholderTextColor={tokens.textSubtle} multiline />
      </Field>

      <Pressable style={[s.primaryBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => void run()}>
        {busy ? <ActivityIndicator color={tokens.textOnAccent} /> : <Text style={s.primaryBtnText}>Build offer with AI</Text>}
      </Pressable>
      {error ? <Text style={s.errorText}>{error}</Text> : null}

      {offer ? (
        <View style={s.resultCard}>
          <View style={s.resultHead}>
            <View style={[s.badge, { backgroundColor: tokens.infoBg }]}>
              <Text style={[s.badgeText, { color: tokens.infoText }]}>{offer.strategy}</Text>
            </View>
            <Text style={s.bigPrice}>{fmtMoney(offer.offerPrice)}</Text>
          </View>
          <View style={s.termGrid}>
            <Term label="Earnest" value={fmtMoney(offer.earnestMoney)} s={s} />
            <Term label="Down" value={fmtMoney(offer.downPayment)} s={s} />
            <Term label="Escalation cap" value={fmtMoney(offer.escalationCap)} s={s} />
            <Term label="Close" value={offer.closeDays ? `${offer.closeDays} days` : "—"} s={s} />
            <Term label="Financing" value={offer.financingType ?? "—"} s={s} />
          </View>
          <View style={s.contingRow}>
            {(["inspection", "appraisal", "loan"] as const).map((c) => (
              <View key={c} style={[s.conting, { backgroundColor: offer.contingencies[c] === "keep" ? tokens.successBg : tokens.warningBg }]}>
                <Text style={[s.contingText, { color: offer.contingencies[c] === "keep" ? tokens.successTextDark : tokens.warningText }]}>
                  {c} · {offer.contingencies[c]}
                </Text>
              </View>
            ))}
          </View>
          <Text style={s.sectionLabel}>Why</Text>
          <Text style={s.bodyText}>{offer.rationale}</Text>
          <Text style={s.sectionLabel}>Cover letter</Text>
          <View style={s.letterBox}>
            <Text style={s.bodyText}>{offer.coverLetter}</Text>
          </View>
          <Text style={s.disclaimer}>{offer.disclaimer}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Term({ label, value, s }: { label: string; value: string; s: Styles }) {
  return (
    <View style={s.term}>
      <Text style={s.termLabel}>{label}</Text>
      <Text style={s.termValue}>{value}</Text>
    </View>
  );
}

// ── Contract review ──────────────────────────────────────────────────

function ContractReview({ tokens, s }: { tokens: ThemeTokens; s: Styles }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<MobileContractReview | null>(null);

  async function run() {
    if (text.trim().length < 40) return setError("Paste the contract text (at least a paragraph).");
    setBusy(true);
    setError(null);
    setReview(null);
    const res = await reviewMobileContract(text.trim());
    setBusy(false);
    if (res.ok === false) return setError(res.message);
    setReview(res.review);
  }

  const sevColor = (sev: "high" | "medium" | "low") =>
    sev === "high" ? tokens.danger : sev === "medium" ? tokens.warning : tokens.textMuted;

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Field label="Paste the contract text" s={s}>
        <TextInput
          style={[s.input, { minHeight: 160, textAlignVertical: "top" }]}
          value={text}
          onChangeText={setText}
          placeholder="Paste the purchase contract text here…"
          placeholderTextColor={tokens.textSubtle}
          multiline
        />
      </Field>
      <Pressable style={[s.primaryBtn, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => void run()}>
        {busy ? <ActivityIndicator color={tokens.textOnAccent} /> : <Text style={s.primaryBtnText}>Review contract with AI</Text>}
      </Pressable>
      {error ? <Text style={s.errorText}>{error}</Text> : null}

      {review ? (
        <View style={s.resultCard}>
          <Text style={s.bodyText}>{review.summary}</Text>
          {review.parties ? <Text style={s.metaLine}>Parties: {review.parties}</Text> : null}
          {review.property ? <Text style={s.metaLine}>Property: {review.property}</Text> : null}

          {review.keyTerms.length > 0 ? (
            <>
              <Text style={s.sectionLabel}>Key terms</Text>
              {review.keyTerms.map((k, i) => (
                <View key={i} style={s.kvRow}>
                  <Text style={s.kvLabel}>{k.label}</Text>
                  <Text style={s.kvValue}>{k.value}</Text>
                </View>
              ))}
            </>
          ) : null}

          {review.deadlines.length > 0 ? (
            <>
              <Text style={s.sectionLabel}>Deadlines</Text>
              {review.deadlines.map((d, i) => (
                <View key={i} style={s.kvRow}>
                  <Text style={s.kvLabel}>{d.label}</Text>
                  <Text style={s.kvValue}>{d.date ?? d.note ?? "—"}</Text>
                </View>
              ))}
            </>
          ) : null}

          {review.flags.length > 0 ? (
            <>
              <Text style={s.sectionLabel}>Flags</Text>
              {review.flags.map((f, i) => (
                <View key={i} style={[s.flagRow, { borderLeftColor: sevColor(f.severity) }]}>
                  <Text style={[s.flagTitle, { color: sevColor(f.severity) }]}>
                    {f.severity.toUpperCase()} · {f.title}
                  </Text>
                  <Text style={s.flagDetail}>{f.detail}</Text>
                </View>
              ))}
            </>
          ) : null}

          {review.missing.length > 0 ? (
            <>
              <Text style={s.sectionLabel}>Blank / missing</Text>
              {review.missing.map((m, i) => (
                <Text key={i} style={s.bullet}>• {m}</Text>
              ))}
            </>
          ) : null}

          {review.questions.length > 0 ? (
            <>
              <Text style={s.sectionLabel}>Ask your broker / attorney</Text>
              {review.questions.map((q, i) => (
                <Text key={i} style={s.bullet}>• {q}</Text>
              ))}
            </>
          ) : null}

          <Text style={s.disclaimer}>{review.disclaimer}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

// ── Compare offers ───────────────────────────────────────────────────

function CompareOffers({ tokens, s }: { tokens: ThemeTokens; s: Styles }) {
  const [listings, setListings] = useState<MobileCompareListing[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    listing: { address: string | null; listPrice: number | null };
    offers: MobileOfferForSummary[];
    summary: MobileOfferCompareSummary;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    fetchCompareListings().then((r) => {
      if (!alive) return;
      if (r.ok) setListings(r.listings);
      else setError(r.message);
      setLoadingList(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function run(listingId: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    const r = await compareListingOffers(listingId);
    setBusy(false);
    if (r.ok === false) return setError(r.message);
    setResult({ listing: r.listing, offers: r.offers, summary: r.summary });
  }

  if (result) {
    const top = result.summary.recommendation.topOfferId;
    const perOffer = (id: string) => result.summary.perOffer.find((p) => p.offerId === id)?.summary;
    return (
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => setResult(null)}>
          <Text style={s.backLink}>← All listings</Text>
        </Pressable>
        <Text style={s.compareTitle}>{result.listing.address ?? "Listing"}</Text>
        <Text style={s.fieldLabel}>List price {fmtMoney(result.listing.listPrice)}</Text>

        <View style={[s.resultCard, { borderColor: tokens.accent }]}>
          <Text style={s.sectionLabel}>AI recommendation</Text>
          <Text style={s.cardTitleStrong}>{result.summary.recommendation.headline}</Text>
          <Text style={s.bodyText}>{result.summary.recommendation.rationale}</Text>
          {result.summary.recommendation.watchOuts.map((w, i) => (
            <Text key={i} style={s.bullet}>• {w}</Text>
          ))}
        </View>

        {result.offers.map((o) => (
          <View key={o.id} style={[s.offerCard, o.id === top && { borderColor: tokens.accent, borderWidth: 2 }]}>
            <View style={s.offerHead}>
              <Text style={s.offerName}>{o.buyerName || "Offer"}</Text>
              {o.id === top ? (
                <View style={[s.badge, { backgroundColor: tokens.successBg }]}>
                  <Text style={[s.badgeText, { color: tokens.successTextDark }]}>Recommended</Text>
                </View>
              ) : null}
            </View>
            <View style={s.termGrid}>
              <Term label="Price" value={fmtMoney(o.price)} s={s} />
              <Term label="Net to seller" value={fmtMoney(o.net)} s={s} />
            </View>
            <Text style={s.metaLine}>
              {[o.isCash ? "cash" : o.financing || "financing n/a", `${o.contingencyCount} contingenc${o.contingencyCount === 1 ? "y" : "ies"}`, o.status]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {perOffer(o.id) ? <Text style={s.bodyText}>{perOffer(o.id)}</Text> : null}
          </View>
        ))}

        <View style={s.resultCard}>
          <Text style={s.sectionLabel}>Note for the seller</Text>
          <Text style={s.bodyText}>{result.summary.sellerNote}</Text>
        </View>
        <Text style={s.disclaimer}>{result.summary.disclaimer}</Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.fieldLabel}>Pick a listing to compare its offers</Text>
      {loadingList ? (
        <ActivityIndicator color={tokens.accent} style={{ marginTop: 16 }} />
      ) : listings.length === 0 ? (
        <Text style={s.emptyText}>
          No listings with offers yet. Offers forwarded in by email show up here automatically once they match one of your listings.
        </Text>
      ) : (
        listings.map((l) => (
          <Pressable key={l.listingId} style={s.listingRow} disabled={busy} onPress={() => void run(l.listingId)}>
            <View style={{ flex: 1 }}>
              <Text style={s.offerName}>{l.address}</Text>
              <Text style={s.metaLine}>List {fmtMoney(l.listPrice)}</Text>
            </View>
            <View style={[s.badge, { backgroundColor: tokens.infoBg }]}>
              <Text style={[s.badgeText, { color: tokens.infoText }]}>
                {l.offerCount} offer{l.offerCount === 1 ? "" : "s"}
              </Text>
            </View>
          </Pressable>
        ))
      )}
      {busy ? <ActivityIndicator color={tokens.accent} style={{ marginTop: 16 }} /> : null}
      {error ? <Text style={s.errorText}>{error}</Text> : null}
    </ScrollView>
  );
}

function Field({ label, children, s, flex }: { label: string; children: ReactNode; s: Styles; flex?: boolean }) {
  return (
    <View style={[s.field, flex && { flex: 1 }]}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

type Styles = ReturnType<typeof createStyles>;

const createStyles = (t: ThemeTokens) =>
  StyleSheet.create({
    flex: { flex: 1, backgroundColor: t.bg },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    segment: { flexDirection: "row", gap: 6, padding: 10, backgroundColor: t.surface, borderBottomWidth: 1, borderBottomColor: t.border },
    segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", backgroundColor: t.surfaceElevated },
    segBtnActive: { backgroundColor: t.accent },
    segBtnText: { fontSize: 13, fontWeight: "600", color: t.textSecondary },
    segBtnTextActive: { color: t.textOnAccent },
    field: { gap: 6 },
    fieldLabel: { fontSize: 12, fontWeight: "600", color: t.textMuted },
    row2: { flexDirection: "row", gap: 12 },
    input: { borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: t.text, backgroundColor: t.surface },
    multiline: { minHeight: 70, textAlignVertical: "top" },
    pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    pill: { borderWidth: 1, borderColor: t.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: t.surface },
    pillOn: { backgroundColor: t.accent, borderColor: t.accent },
    pillText: { fontSize: 13, color: t.textSecondary, textTransform: "capitalize" },
    pillTextOn: { color: t.textOnAccent, fontWeight: "600" },
    primaryBtn: { backgroundColor: t.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
    primaryBtnText: { color: t.textOnAccent, fontSize: 15, fontWeight: "700" },
    errorText: { fontSize: 13, color: t.danger },
    resultCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, padding: 14, gap: 8, marginTop: 4 },
    resultHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
    badgeText: { fontSize: 11, fontWeight: "700", textTransform: "capitalize" },
    bigPrice: { fontSize: 24, fontWeight: "800", color: t.text },
    termGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 },
    term: { minWidth: "28%", backgroundColor: t.surfaceMuted, borderRadius: 10, padding: 10 },
    termLabel: { fontSize: 11, color: t.textMuted },
    termValue: { fontSize: 15, fontWeight: "700", color: t.text, marginTop: 2 },
    contingRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
    conting: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
    contingText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
    sectionLabel: { fontSize: 12, fontWeight: "700", color: t.textMuted, textTransform: "uppercase", marginTop: 8 },
    bodyText: { fontSize: 14, color: t.text, lineHeight: 20 },
    letterBox: { backgroundColor: t.surfaceMuted, borderRadius: 10, padding: 12 },
    disclaimer: { fontSize: 11, color: t.textSubtle, marginTop: 8, lineHeight: 16 },
    metaLine: { fontSize: 13, color: t.textSecondary, marginTop: 2 },
    kvRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5, borderTopWidth: 1, borderTopColor: t.borderSubtle },
    kvLabel: { fontSize: 13, color: t.textMuted, flex: 1 },
    kvValue: { fontSize: 13, fontWeight: "600", color: t.text, flex: 1, textAlign: "right" },
    flagRow: { borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 4, marginTop: 6 },
    flagTitle: { fontSize: 13, fontWeight: "700" },
    flagDetail: { fontSize: 13, color: t.textSecondary, marginTop: 2, lineHeight: 18 },
    bullet: { fontSize: 13, color: t.textSecondary, marginTop: 3, lineHeight: 18 },
    backLink: { fontSize: 14, color: t.accent, fontWeight: "600" },
    compareTitle: { fontSize: 18, fontWeight: "700", color: t.text, marginTop: 2 },
    cardTitleStrong: { fontSize: 15, fontWeight: "700", color: t.text },
    listingRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12 },
    offerCard: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 12, padding: 12, gap: 6 },
    offerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    offerName: { fontSize: 15, fontWeight: "600", color: t.text },
    emptyText: { fontSize: 14, color: t.textMuted, lineHeight: 20, marginTop: 12 },
  });
