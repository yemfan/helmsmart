"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  Plus,
  Pencil,
  Check,
  Home as HomeIcon,
  FileText,
  Key,
  MessageCircle,
  ScanLine,
  Sparkles,
  Upload,
  Download,
  UserPlus,
  Mail,
  AlertCircle,
  ChevronDown,
  MoreHorizontal,
  X,
} from "lucide-react";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { CallButton } from "@/components/contacts/CallButton";
import { LeadProfileDrawer } from "@/components/closeboss/LeadProfileDrawer";
import { CsvImportModal } from "@/components/crm/CsvImportModal";
import { SendPostcardModal } from "@/components/postcards/SendPostcardModal";
import { BulkSendPostcardModal } from "@/components/postcards/BulkSendPostcardModal";
import { LimitWarningBanner } from "@/components/entitlements/LimitWarningBanner";
import { listOutboundEnabled, type LocaleId } from "@/lib/locales/registry";

type LeadRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  property_address: string | null;
  source: string | null;
  rating: string | null;
  last_contacted_at: string | null;
  notes: string | null;
  created_at: string;
  /**
   * BCP-47 base id (e.g. "zh") or null. Overrides the agent's default
   * outbound language for AI-generated SMS/email to this contact.
   */
  preferred_language: string | null;
  /** Total showings logged for this contact (all statuses). */
  showing_total?: number;
  /** Count of showings where buyer's overall_reaction = "love". */
  showing_loved?: number;
  /** Offers currently in draft / submitted / countered state. */
  offer_active?: number;
  /** Offers that reached `accepted` status (total, not just this month). */
  offer_won?: number;
};

/**
 * A pie slice as the API returns it: what the slice IS, plus its colour.
 *
 * `key` rather than `name` — the legend used to render whatever English the
 * stats route put in `name`, so the Chinese contacts page showed a
 * `Hot / Warm / Cold` legend beside a table of 热门 / 温和 / 冷淡 pills. The
 * display word is resolved here, where the locale is known.
 */
type ChartItem = { key: string; value: number; color: string };
/** `month` is "YYYY-MM"; the axis label is formatted per-locale at render. */
type GrowthItem = { month: string; count: number };

type Stats = {
  rating: ChartItem[];
  lastContacted: ChartItem[];
  growth: GrowthItem[];
  total: number;
};

const CSV_TEMPLATE = "Name,Email,Phone,Address,Type,Notes\nJohn Doe,john@example.com,(555) 123-4567,123 Main St,buyer,Interested in 3bd homes\n";

function downloadTemplate() {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "contacts-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type ContactsT = (key: string, options?: Record<string, unknown>) => string;

/**
 * `t` here is the function from `useTranslation("web_contacts_client")` \u2014
 * callers pass it down so the "today / yesterday / Nd ago" labels follow
 * the active locale without each call site re-acquiring a hook.
 */
function timeAgo(iso: string | null, t: ContactsT) {
  if (!iso) return "\u2014";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return t("time_ago.today");
  if (days === 1) return t("time_ago.yesterday");
  if (days < 30) return t("time_ago.days", { count: days });
  if (days < 365) return t("time_ago.months", { count: Math.floor(days / 30) });
  return t("time_ago.years", { count: Math.floor(days / 365) });
}

const RATING_COLORS: Record<string, string> = {
  hot: "bg-red-100 text-red-700",
  warm: "bg-amber-100 text-amber-700",
  cold: "bg-gray-100 text-gray-600",
};

function MiniPie({
  data,
  title,
  labelFor,
}: {
  data: ChartItem[];
  title: string;
  labelFor: (key: string) => string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="text-xs font-semibold text-gray-500 mb-2">{title}</h2>
      <div className="flex items-center gap-3">
        <div className="h-[120px] w-[120px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" cx="50%" cy="50%" outerRadius={50} innerRadius={28} strokeWidth={1}>
                {data.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={((v: number) => v) as never} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-1 text-xs">
          {data.map((d) => (
            <div key={d.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-gray-600">{labelFor(d.key)}</span>
              <span className="font-semibold text-gray-900">{d.value}</span>
              {total > 0 && <span className="text-gray-400">({Math.round((d.value / total) * 100)}%)</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type ActionMsg = { text: string; tone: "ok" | "error" };

/**
 * The outcome of an action, in a colour that matches the outcome.
 *
 * `role="alert"` on the failure case so a screen reader announces it — the
 * previous markup was a plain div, which meant a blind user got no signal at
 * all that their save had failed.
 */
function ActionBanner({
  msg,
  onDismiss,
  dismissLabel,
}: {
  msg: ActionMsg;
  onDismiss: () => void;
  dismissLabel: string;
}) {
  const bad = msg.tone === "error";
  return (
    <div
      role={bad ? "alert" : "status"}
      aria-live={bad ? "assertive" : "polite"}
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
        bad
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {bad ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      ) : (
        <Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      )}
      <span className="flex-1">{msg.text}</span>
      {bad ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="shrink-0 rounded p-0.5 text-red-500 hover:bg-red-100 hover:text-red-700"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

type SortKey = "name" | "email" | "rating" | "last_contacted_at" | "created_at";

/** Heat order for the rating sort — hot leads first (not alphabetical). */
const RATING_RANK: Record<string, number> = { hot: 0, warm: 1, cold: 2 };

export default function ContactsClient({ leads: initialLeads }: { leads: LeadRow[] }) {
  const { t, i18n } = useTranslation("web_contacts_client");
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  /*
   * Follow the server. `useState(initialLeads)` seeds once and then ignores
   * the prop, so a router.refresh() would fetch new rows that never appeared.
   * Server data is the fresher of the two whenever it changes, so it wins —
   * including over the optimistic edits made below.
   */
  useEffect(() => { setLeads(initialLeads); }, [initialLeads]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  // Default: hottest leads first (high-potential pops to the top), newest
  // within the same heat. Users can re-sort by any column.
  const [sortBy, setSortBy] = useState<SortKey>("rating");
  const [sortAsc, setSortAsc] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  // Click-outside to close the +Add dropdown.
  useEffect(() => {
    if (!addMenuOpen) return;
    const onClickAway = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setAddMenuOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onClickAway);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onClickAway);
      document.removeEventListener("keydown", onEsc);
    };
  }, [addMenuOpen]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<LeadRow>>({});
  const [addFields, setAddFields] = useState({ name: "", email: "", phone: "", property_address: "", notes: "" });
  const [addErrors, setAddErrors] = useState<Record<string, string[]>>({});
  const [actionLoading, setActionLoading] = useState(false);
  /**
   * Every outcome on this page used to land in one blue box. "Contact added"
   * and "Phone number already in use" were the same colour, in the same place,
   * with the same weight — so a failed save read as a successful one.
   *
   * Worse, the success half was unreachable: `addContact` set the message and
   * then called `window.location.reload()` on the very next line, so the ONLY
   * banner a user could ever actually see was an error styled as information.
   */
  const [actionMsg, setActionMsg] = useState<ActionMsg | null>(null);
  const succeeded = (text: string) => setActionMsg({ text, tone: "ok" });
  const failed = (text: string) => setActionMsg({ text, tone: "error" });
  /*
   * Confirmations clear themselves; failures do not. A success banner that
   * lingers makes the page look stuck, but a failure the user has not read yet
   * is the whole reason the banner exists — that one waits to be dismissed.
   */
  useEffect(() => {
    if (actionMsg?.tone !== "ok") return;
    const id = window.setTimeout(() => setActionMsg(null), 5000);
    return () => window.clearTimeout(id);
  }, [actionMsg]);
  const [postcardTarget, setPostcardTarget] = useState<{
    contactId: string;
    name: string;
    email: string | null;
    phone: string | null;
  } | null>(null);
  /** Contact ids checkbox-selected for bulk actions (postcards, etc). */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /** Lead whose full profile drawer is open (clicking a contact name). */
  const [profileLeadId, setProfileLeadId] = useState<string | null>(null);
  const [bulkPostcardOpen, setBulkPostcardOpen] = useState(false);
  /** Confirm gate for the (irreversible) bulk delete. */
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  /*
   * Month labels for the growth chart. The stats route used to format these
   * with a hardcoded "en-US", so the Chinese dashboard's growth axis read
   * Jan/Feb/Mar. Appending a time keeps "YYYY-MM-01" parsing as LOCAL
   * midnight — parsed as UTC it lands a month early west of Greenwich.
   */
  const growthWithLabels = useMemo(
    () =>
      (stats?.growth ?? []).map((g) => ({
        ...g,
        label: new Date(`${g.month}-01T00:00:00`).toLocaleDateString(
          intlLocale(i18n.language),
          { month: "short", year: "2-digit" },
        ),
      })),
    [stats?.growth, i18n.language],
  );

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/contacts/stats");
      const body = await res.json().catch(() => ({}));
      if (body.ok) setStats(body);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  async function addContact() {
    setActionLoading(true); setActionMsg(null); setAddErrors({});
    try {
      const res = await fetch("/api/dashboard/contacts/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...addFields, source: "manual_entry", forceCreate: true }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        if (res.status === 400 && body.details && typeof body.details === "object") {
          setAddErrors(body.details as Record<string, string[]>);
          /*
           * The API answers a validation failure with the English string
           * "Validation failed", and echoing it put an English banner on a
           * Chinese page directly under a Chinese form. The banner is ours to
           * word: the server's per-field detail is already rendered inline
           * beside each input, so the banner only has to point at it.
           */
          throw new Error(t("messages.check_fields"));
        }
        throw new Error(body.error ?? t("messages.add_failed"));
      }
      setAddFields({ name: "", email: "", phone: "", property_address: "", notes: "" });
      setShowAddForm(false);
      succeeded(t("messages.added"));
      /*
       * `window.location.reload()` used to sit here. It threw away the React
       * state one line after we set it, so the confirmation never rendered —
       * and it cost a full document load to show one new row. router.refresh()
       * re-runs the server component and hands down fresh `leads`; the effect
       * below copies them into state, and the banner survives.
       */
      router.refresh();
    } catch (e) { failed(e instanceof Error ? e.message : t("messages.default_error")); }
    finally { setActionLoading(false); }
  }

  async function saveEdit(id: string) {
    setActionLoading(true); setActionMsg(null);
    try {
      const res = await fetch(`/api/dashboard/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFields),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? t("messages.update_failed"));
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, ...editFields } as LeadRow : l));
      setEditingId(null);
      succeeded(t("messages.updated"));
    } catch (e) { failed(e instanceof Error ? e.message : t("messages.default_error")); }
    finally { setActionLoading(false); }
  }

  async function markContacted(id: string) {
    setActionLoading(true); setActionMsg(null);
    try {
      const now = new Date().toISOString();
      const res = await fetch(`/api/dashboard/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ last_contacted_at: now }),
      });
      if (!res.ok) throw new Error(t("messages.update_failed"));
      setLeads((prev) => prev.map((l) => l.id === id ? { ...l, last_contacted_at: now } : l));
      succeeded(t("messages.marked_contacted"));
      loadStats();
    } catch (e) { failed(e instanceof Error ? e.message : t("messages.default_error")); }
    finally { setActionLoading(false); }
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true); setActionMsg(null);
    try {
      const results = await Promise.all(
        ids.map((id) =>
          fetch(`/api/dashboard/leads/${id}`, { method: "DELETE" })
            .then((r) => ({ id, ok: r.ok }))
            .catch(() => ({ id, ok: false })),
        ),
      );
      const deletedSet = new Set(results.filter((r) => r.ok).map((r) => r.id));
      if (deletedSet.size > 0) {
        setLeads((prev) => prev.filter((l) => !deletedSet.has(l.id)));
        setSelectedIds(new Set());
        loadStats();
      }
      // A partial delete is a failure, not a quieter success: some of what the
      // user selected is still there, and they need to see which colour it is.
      if (deletedSet.size < ids.length) failed(t("messages.delete_failed"));
      else succeeded(t("messages.deleted", { count: deletedSet.size }));
    } catch {
      failed(t("messages.delete_failed"));
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
    }
  }

  function startEdit(lead: LeadRow) {
    setEditingId(lead.id);
    setEditFields({
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      property_address: lead.property_address,
      notes: lead.notes,
      rating: lead.rating,
      preferred_language: lead.preferred_language,
    });
  }

  function toggleSort(key: SortKey) {
    if (sortBy === key) setSortAsc((v) => !v);
    else { setSortBy(key); setSortAsc(true); }
  }

  // Charts used to be the first 400px of the page. Agents open this page to
  // find a person, so the list leads and the charts sit behind a toggle that
  // remembers its state per browser.
  const [showInsights, setShowInsights] = useState(false);
  useEffect(() => {
    try {
      setShowInsights(localStorage.getItem("cb_contacts_insights") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleInsights = () => {
    setShowInsights((v) => {
      try {
        localStorage.setItem("cb_contacts_insights", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  const filtered = leads
    .filter((l) => {
      if (ratingFilter !== "all" && (l.rating ?? "").toLowerCase() !== ratingFilter) return false;
      if (!search.trim()) return true;
      const s = search.toLowerCase();
      return (
        (l.name ?? "").toLowerCase().includes(s) ||
        (l.email ?? "").toLowerCase().includes(s) ||
        (l.phone ?? "").includes(s) ||
        (l.property_address ?? "").toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      // Rating sorts by heat (hot → warm → cold → unrated), not alphabetically,
      // with newest-first as the tiebreaker so hot leads surface at the top.
      if (sortBy === "rating") {
        const ra = RATING_RANK[(a.rating ?? "").toLowerCase()] ?? 3;
        const rb = RATING_RANK[(b.rating ?? "").toLowerCase()] ?? 3;
        if (ra !== rb) return (sortAsc ? 1 : -1) * (ra - rb);
        const ca = a.created_at ?? "";
        const cb = b.created_at ?? "";
        return ca < cb ? 1 : ca > cb ? -1 : 0;
      }
      const dir = sortAsc ? 1 : -1;
      const av = a[sortBy] ?? "";
      const bv = b[sortBy] ?? "";
      return av < bv ? -dir : av > bv ? dir : 0;
    });

  /** Inline edit form — shared by the table row and the phone card. */
  function renderEditForm() {
    const field = "w-full rounded border border-gray-300 px-2 py-1.5 text-sm";
    return (
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input aria-label={t("columns.name")} value={editFields.name ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, name: e.target.value }))} placeholder={t("columns.name")} className={field} />
          <input aria-label={t("columns.email")} value={editFields.email ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, email: e.target.value }))} placeholder={t("columns.email")} className={field} />
          <input aria-label={t("columns.phone")} value={editFields.phone ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, phone: e.target.value }))} placeholder={t("columns.phone")} className={field} />
          <select aria-label={t("columns.rating")} value={editFields.rating ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, rating: e.target.value || null }))} className={field}>
            <option value="">{t("rating.empty")}</option>
            <option value="hot">{t("rating.hot")}</option>
            <option value="warm">{t("rating.warm")}</option>
            <option value="cold">{t("rating.cold")}</option>
          </select>
          {/* Per-contact preferred language override (BCP-47 base id). Empty =
              the agent's default_outbound_language; see lib/locales/resolveLocale.ts. */}
          <select
            aria-label={t("row.language_default")}
            value={editFields.preferred_language ?? ""}
            onChange={(e) => setEditFields((f) => ({ ...f, preferred_language: (e.target.value || null) as LocaleId | null }))}
            className={field}
          >
            <option value="">{t("row.language_default")}</option>
            {listOutboundEnabled().map((l) => (
              <option key={l.id} value={l.id}>
                {l.nativeLabel}
              </option>
            ))}
          </select>
          <input aria-label={t("columns.address")} value={editFields.property_address ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, property_address: e.target.value }))} placeholder={t("columns.address")} className={field} />
          <input aria-label={t("columns.memo")} value={editFields.notes ?? ""} onChange={(e) => setEditFields((f) => ({ ...f, notes: e.target.value }))} placeholder={t("columns.memo")} className={`${field} sm:col-span-2 lg:col-span-3`} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => void saveEdit(editingId as string)} disabled={actionLoading} className="rounded-lg bg-[#0072ce] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#005ca8] disabled:opacity-50">{t("row.save")}</button>
          <button onClick={() => setEditingId(null)} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">{t("row.cancel")}</button>
        </div>
      </div>
    );
  }

  /** Everything that used to be an icon-only button per row, now a labelled menu. */
  function rowMenuItems(c: LeadRow): RowMenuItem[] {
    return [
      { label: t("row.edit_label"), icon: <Pencil className="h-4 w-4" strokeWidth={2} />, onClick: () => startEdit(c) },
      { label: t("row.mark_contacted_label"), icon: <Check className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />, onClick: () => void markContacted(c.id), disabled: actionLoading },
      { label: t("row.schedule_showing_label"), icon: <HomeIcon className="h-4 w-4" strokeWidth={2} />, href: `/dashboard/showings/new?contactId=${encodeURIComponent(c.id)}` },
      { label: t("row.draft_offer_label"), icon: <FileText className="h-4 w-4" strokeWidth={2} />, href: `/dashboard/offers/new?contactId=${encodeURIComponent(c.id)}` },
      { label: t("row.start_deal_label"), icon: <Key className="h-4 w-4" strokeWidth={2} />, href: `/dashboard/transactions/new?contactId=${encodeURIComponent(c.id)}` },
      {
        label: t("row.send_postcard_label"),
        icon: <Mail className="h-4 w-4" strokeWidth={2} />,
        onClick: () => setPostcardTarget({ contactId: c.id, name: c.name ?? "", email: c.email, phone: c.phone }),
      },
    ];
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{t("header.title")}</h1>
          <p className="text-sm text-gray-500">
            {t("header.subtitle_total", { count: leads.length })}
          </p>
        </div>
        {stats ? (
          <button
            type="button"
            onClick={toggleInsights}
            aria-expanded={showInsights}
            className="shrink-0 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            {showInsights ? t("insights.hide") : t("insights.show")}
          </button>
        ) : null}
      </div>

      {/* Shows only when the agent is at/near their CRM contact cap. */}
      <LimitWarningBanner action="add_contact" />

      {/* Charts — behind the Insights toggle */}
      {stats && showInsights && (
        <div className="grid gap-3 md:grid-cols-3">
          <MiniPie
            data={stats.rating}
            title={t("charts.rating")}
            labelFor={(key) => t(`rating.${key}`, { defaultValue: key })}
          />
          <MiniPie
            data={stats.lastContacted}
            title={t("charts.last_contacted")}
            labelFor={(key) => t(`contactedBucket.${key}`, { defaultValue: key })}
          />

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-xs font-semibold text-gray-500 mb-2">{t("charts.growth")}</h2>
            <div className="h-[120px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthWithLabels} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} stroke="#9ca3af" interval={1} />
                  <YAxis tick={{ fontSize: 9 }} stroke="#9ca3af" allowDecimals={false} />
                  <Tooltip formatter={((v: number) => [v, t("charts.growth_tooltip")]) as never} />
                  <Bar dataKey="count" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Action toolbar — single +Add dropdown anchored to the right.
          Replaces the previous four-button row (Enter Contact / Scan
          Card / Upload CSV / Download Template). Same actions live
          inside the dropdown menu. */}
      {actionMsg && <ActionBanner msg={actionMsg} onDismiss={() => setActionMsg(null)} dismissLabel={t("messages.dismiss")} />}
      <div className="flex justify-end">
        <div ref={addMenuRef} className="relative inline-block">
          <button
            type="button"
            onClick={() => {
              if (showAddForm) setShowAddForm(false);
              setAddMenuOpen((v) => !v);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0072ce] px-3 py-2 text-sm font-medium text-white hover:bg-[#005ca8]"
            aria-haspopup="menu"
            aria-expanded={addMenuOpen}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} />
            {t("add_menu.button")}
            <ChevronDown className="h-3.5 w-3.5 text-white/80" strokeWidth={2} aria-hidden />
          </button>
          {addMenuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-20 mt-2 w-56 origin-top-right overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg ring-1 ring-black/5"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAddMenuOpen(false);
                  setShowAddForm(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <UserPlus className="h-4 w-4 text-gray-500" />
                {t("add_menu.enter_contact")}
              </button>
              <Link
                href="/dashboard/contacts/scan"
                role="menuitem"
                onClick={() => setAddMenuOpen(false)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <ScanLine className="h-4 w-4 text-gray-500" />
                {t("add_menu.scan_card")}
              </Link>
              <Link
                href="/dashboard/contacts/import-file"
                role="menuitem"
                onClick={() => setAddMenuOpen(false)}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Sparkles className="h-4 w-4 text-gray-500" />
                {t("add_menu.ai_extract")}
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAddMenuOpen(false);
                  setCsvImportOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Upload className="h-4 w-4 text-gray-500" />
                {t("add_menu.upload_csv")}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAddMenuOpen(false);
                  downloadTemplate();
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
              >
                <Download className="h-4 w-4 text-gray-500" />
                {t("add_menu.download_template")}
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* Inline add form */}
      {showAddForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">{t("add_form.title")}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-gray-700">
              {t("add_form.placeholder_name")}
              <input value={addFields.name} onChange={(e) => setAddFields((f) => ({ ...f, name: e.target.value }))} placeholder={t("add_form.placeholder_name")}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${addErrors.name?.length ? "border-red-400" : "border-gray-300"}`} />
              {addErrors.name?.length ? <p className="mt-1 text-xs text-red-600">{addErrors.name.join(" ")}</p> : null}
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {t("add_form.placeholder_email")}
              <input value={addFields.email} onChange={(e) => setAddFields((f) => ({ ...f, email: e.target.value }))} placeholder={t("add_form.placeholder_email")} type="email" inputMode="email" autoCapitalize="off"
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${addErrors.email?.length ? "border-red-400" : "border-gray-300"}`} />
              {addErrors.email?.length ? <p className="mt-1 text-xs text-red-600">{addErrors.email.join(" ")}</p> : null}
            </label>
            <label className="block text-sm font-medium text-gray-700">
              {t("add_form.placeholder_phone")}
              <input value={addFields.phone} onChange={(e) => setAddFields((f) => ({ ...f, phone: e.target.value }))} placeholder={t("add_form.placeholder_phone")} inputMode="tel"
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${addErrors.phone?.length ? "border-red-400" : "border-gray-300"}`} />
              {addErrors.phone?.length ? <p className="mt-1 text-xs text-red-600">{addErrors.phone.join(" ")}</p> : null}
            </label>
            <div className="block text-sm font-medium text-gray-700">
              {t("add_form.placeholder_address")}
              <AddressAutocomplete
                value={addFields.property_address}
                onChange={(v) => setAddFields((f) => ({ ...f, property_address: v }))}
                onSelect={(v) => setAddFields((f) => ({ ...f, property_address: v.formattedAddress }))}
                placeholder={t("add_form.placeholder_address")}
                className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${addErrors.property_address?.length ? "border-red-400" : "border-gray-300"}`}
              />
              {addErrors.property_address?.length ? <p className="mt-1 text-xs text-red-600">{addErrors.property_address.join(" ")}</p> : null}
            </div>
          </div>
          <label className="block text-sm font-medium text-gray-700">
            {t("add_form.placeholder_notes")}
            <input value={addFields.notes} onChange={(e) => setAddFields((f) => ({ ...f, notes: e.target.value }))} placeholder={t("add_form.placeholder_notes")}
              className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm ${addErrors.notes?.length ? "border-red-400" : "border-gray-300"}`} />
            {addErrors.notes?.length ? <p className="mt-1 text-xs text-red-600">{addErrors.notes.join(" ")}</p> : null}
          </label>
          {/*
            * The banner at the top of the page is ~120 lines of markup above
            * this button — far off-screen once the form is open. A failed save
            * announced up there looks like nothing happened at all, so the
            * failure is repeated right where the click was.
            */}
          {actionMsg?.tone === "error" ? (
            <ActionBanner msg={actionMsg} onDismiss={() => setActionMsg(null)} dismissLabel={t("messages.dismiss")} />
          ) : null}
          <button type="button" onClick={() => void addContact()} disabled={actionLoading || !addFields.name}
            className="rounded-lg bg-[#0072ce] px-4 py-2 text-sm font-medium text-white hover:bg-[#005ca8] disabled:opacity-50">
            {actionLoading ? t("add_form.saving") : t("add_form.submit")}
          </button>
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex flex-wrap gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("search.placeholder")}
          className="flex-1 min-w-[200px] max-w-sm rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          aria-label={t("columns.rating")}
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
        >
          <option value="all">{t("search.filter_all")}</option>
          <option value="hot">{t("rating.hot")}</option>
          <option value="warm">{t("rating.warm")}</option>
          <option value="cold">{t("rating.cold")}</option>
        </select>
      </div>

      {/* Bulk action bar — appears only when any row is selected.
          For now the only bulk action is "Send postcard"; more can
          hang off this bar later (tag, export, etc). */}
      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm">
          <div className="text-indigo-900">
            {t("bulk_bar.selected", { count: selectedIds.size })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-md px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
            >
              {t("bulk_bar.clear")}
            </button>
            <button
              type="button"
              onClick={() => setBulkPostcardOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
            >
              {t("bulk_bar.send_postcards", { count: selectedIds.size })}
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
            >
              {t("bulk_bar.delete", { count: selectedIds.size })}
            </button>
          </div>
        </div>
      ) : null}

      {/* Phones: cards. The table below is md+ only. */}
      <div className="md:hidden rounded-xl border border-gray-200 bg-white shadow-sm divide-y divide-gray-100">
        {filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {search ? t("empty.no_match") : t("empty.no_contacts")}
          </p>
        ) : (
          filtered.map((c) =>
            editingId === c.id ? (
              <div key={c.id} className="bg-blue-50/30 p-4">{renderEditForm()}</div>
            ) : (
              <div key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setProfileLeadId(c.id)}
                      className="block max-w-full truncate text-left text-[15px] font-semibold text-gray-900 hover:text-blue-700"
                    >
                      {c.name ?? t("row.empty_value")}
                    </button>
                    <p className="mt-0.5 truncate text-xs text-gray-500">
                      {[c.phone, c.email].filter(Boolean).join(" · ") || t("row.empty_value")}
                    </p>
                  </div>
                  <RowMenu label={t("row.more_actions")} items={rowMenuItems(c)} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <RatingBadges c={c} t={t} />
                  <span className="text-xs text-gray-500">{timeAgo(c.last_contacted_at, t)}</span>
                </div>
                {c.notes ? <p className="mt-2 line-clamp-2 text-xs text-gray-500">{c.notes}</p> : null}
                <div className="mt-3 flex items-center gap-2">
                  <PrimaryAction c={c} t={t} block />
                  <CallButton contactId={c.id} hasPhone={Boolean(c.phone)} />
                </div>
              </div>
            ),
          )
        )}
      </div>

      {/* Table (md+) */}
      <div className="hidden md:block rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                {/* Select-all for bulk actions (postcards, etc).
                    Toggles all currently filtered contacts. */}
                <th className="w-8 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((c) => selectedIds.has(c.id))
                    }
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) filtered.forEach((c) => next.add(c.id));
                        else filtered.forEach((c) => next.delete(c.id));
                        return next;
                      });
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                    aria-label={t("row.select_all_a11y")}
                  />
                </th>
                {/* Email and Address left the table (2026-09 UX audit): they
                    are searchable, editable inline, and shown in the profile
                    drawer — nine columns did not survive a laptop, let alone
                    a phone. */}
                {([
                  { key: "name" as SortKey, label: t("columns.name") },
                  { key: null, label: t("columns.phone") },
                  { key: "rating" as SortKey, label: t("columns.rating") },
                  { key: "last_contacted_at" as SortKey, label: t("columns.last_contacted") },
                  { key: null, label: t("columns.memo") },
                  { key: null, label: t("columns.actions"), srOnly: true },
                ] as const).map((col, i) => (
                  <th
                    key={i}
                    className={`text-left px-4 py-2.5 font-medium ${col.key ? "cursor-pointer select-none hover:text-gray-900" : ""}`}
                    onClick={() => col.key && toggleSort(col.key)}
                  >
                    {"srOnly" in col && col.srOnly ? <span className="sr-only">{col.label}</span> : col.label}
                    {col.key && sortBy === col.key && (
                      <span className="ml-1 text-[10px]">{sortAsc ? "\u25B2" : "\u25BC"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((c) => {
                const isEditing = editingId === c.id;
                if (isEditing) {
                  return (
                    <tr key={c.id} className="bg-blue-50/30">
                      <td className="w-8 px-3 py-2" />
                      <td colSpan={6} className="px-4 py-3">{renderEditForm()}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={c.id} className="hover:bg-gray-50/50">
                    <td className="w-8 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(c.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-slate-300"
                        aria-label={
                          c.name
                            ? t("row.select_contact_a11y", { name: c.name })
                            : t("row.select_contact_a11y_fallback")
                        }
                      />
                    </td>
                    <td className="px-4 py-2.5 max-w-[240px]">
                      <button
                        type="button"
                        onClick={() => setProfileLeadId(c.id)}
                        className="block max-w-full truncate rounded text-left font-medium text-gray-900 hover:text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40"
                        title={t("row.open_profile_tooltip")}
                      >
                        {c.name ?? t("row.empty_value")}
                      </button>
                      {c.email ? (
                        <a href={`mailto:${c.email}`} className="block truncate text-xs text-gray-500 hover:text-blue-600" title={t("row.email_tooltip", { email: c.email })}>
                          {c.email}
                        </a>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span>{c.phone ?? t("row.empty_value")}</span>
                        <CallButton contactId={c.id} hasPhone={Boolean(c.phone)} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <RatingBadges c={c} t={t} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">{timeAgo(c.last_contacted_at, t)}</td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 max-w-[200px] truncate" title={c.notes ?? ""}>
                      {c.notes ?? t("row.empty_value")}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <PrimaryAction c={c} t={t} />
                        <RowMenu
                          label={t("row.more_actions")}
                          items={rowMenuItems(c)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    {search ? t("empty.no_match") : t("empty.no_contacts")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CsvImportModal
        open={csvImportOpen}
        onClose={() => setCsvImportOpen(false)}
        onImported={() => window.location.reload()}
      />

      {postcardTarget ? (
        <SendPostcardModal
          open={postcardTarget !== null}
          onClose={() => setPostcardTarget(null)}
          target={postcardTarget}
          onSent={() => {
            succeeded(t("messages.postcard_sent"));
          }}
        />
      ) : null}

      {bulkPostcardOpen ? (
        <BulkSendPostcardModal
          open={bulkPostcardOpen}
          onClose={() => setBulkPostcardOpen(false)}
          recipients={leads
            .filter((c) => selectedIds.has(c.id))
            .map((c) => ({
              contactId: c.id,
              name: c.name ?? c.email ?? t("bulk_postcard.recipient_fallback_name"),
              email: c.email,
              phone: c.phone,
            }))}
          onSent={() => {
            succeeded(t("messages.postcards_sent", { count: selectedIds.size }));
            setSelectedIds(new Set());
          }}
        />
      ) : null}

      {deleteConfirmOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {t("delete_dialog.title", { count: selectedIds.size })}
            </h3>
            <p className="mt-2 text-sm text-slate-600">{t("delete_dialog.body")}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(false)}
                disabled={deleting}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                {t("delete_dialog.cancel")}
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={deleting}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting ? t("delete_dialog.deleting") : t("delete_dialog.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Full lead profile — opened by clicking a contact name in the table.
          Surfaces the rich profile (score, next-best-action, story) that was
          previously only reachable from the Receptionist call modal. */}
      <LeadProfileDrawer leadId={profileLeadId} onClose={() => setProfileLeadId(null)} />
    </div>
  );
}

/** Rating pill + the language / showings / offers badges that ride beside it. */
function RatingBadges({ c, t }: { c: LeadRow; t: ContactsT }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {c.rating ? (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RATING_COLORS[c.rating.toLowerCase()] ?? "bg-gray-100 text-gray-600"}`}>
          {t(`rating.${c.rating.toLowerCase()}`, { defaultValue: c.rating })}
        </span>
      ) : (
        <span className="text-gray-400">{t("row.empty_value")}</span>
      )}
      {c.preferred_language ? (
        <span
          className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700"
          title={t("row.language_tooltip", { lang: c.preferred_language })}
        >
          {listOutboundEnabled().find((l) => l.id === c.preferred_language)?.nativeLabel ?? c.preferred_language}
        </span>
      ) : null}
      {c.showing_total && c.showing_total > 0 ? (
        <Link
          href={`/dashboard/showings?contactId=${encodeURIComponent(c.id)}`}
          className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-200"
          title={
            c.showing_loved && c.showing_loved > 0
              ? t("row.showings_tooltip_with_loved", { count: c.showing_total, loved: c.showing_loved })
              : t("row.showings_tooltip", { count: c.showing_total })
          }
        >
          {c.showing_total}
          {c.showing_loved && c.showing_loved > 0 ? <span className="ml-1 text-red-500">♥{c.showing_loved}</span> : null}
        </Link>
      ) : null}
      {(c.offer_active ?? 0) > 0 || (c.offer_won ?? 0) > 0 ? (
        <Link
          href={`/dashboard/offers?contactId=${encodeURIComponent(c.id)}`}
          className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100"
          title={t("row.offers_tooltip", { active: c.offer_active ?? 0, won: c.offer_won ?? 0 })}
        >
          {(c.offer_active ?? 0) > 0 ? `${c.offer_active}` : ""}
          {(c.offer_won ?? 0) > 0 ? <span className={(c.offer_active ?? 0) > 0 ? "ml-1" : ""}>✓{c.offer_won}</span> : null}
        </Link>
      ) : null}
    </div>
  );
}

/**
 * The one visible action per row: Text when there is a phone, Email when
 * there is only an address. Everything else lives in the row menu.
 */
function PrimaryAction({ c, t, block }: { c: LeadRow; t: ContactsT; block?: boolean }) {
  const cls = `inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50 ${block ? "flex-1" : ""}`;
  if (c.phone) {
    return (
      <a href={`sms:${c.phone}`} className={cls} title={t("row.text_phone_tooltip", { phone: c.phone })}>
        <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {t("row.text_label")}
      </a>
    );
  }
  if (c.email) {
    return (
      <a href={`mailto:${c.email}`} className={cls} title={t("row.email_tooltip", { email: c.email })}>
        <Mail className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
        {t("row.email_label")}
      </a>
    );
  }
  return null;
}

type RowMenuItem = {
  label: string;
  icon?: React.ReactNode;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
};

/**
 * Labelled overflow menu for the row actions. Replaces eight 16px icon-only
 * buttons whose names only existed as hover tooltips — which touch screens
 * never show. Closes on outside click and Escape.
 */
function RowMenu({ label, items }: { label: string; items: RowMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const itemCls = "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40";
  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg ring-1 ring-black/5">
          {items.map((it) =>
            it.href ? (
              <Link key={it.label} href={it.href} role="menuitem" onClick={() => setOpen(false)} className={itemCls}>
                <span className="text-gray-500">{it.icon}</span>
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick?.();
                }}
                className={itemCls}
              >
                <span className="text-gray-500">{it.icon}</span>
                {it.label}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

