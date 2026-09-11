"use client";

import { useState, useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen, Users, Inbox, PhoneIncoming, Calendar,
  PhoneOutgoing, Share2, Settings, LogOut, LayoutDashboard,
  CheckSquare, Mail, BarChart2, Zap, Clock, TrendingUp, FolderOpen, Bot,
  ChevronUp, KeyRound, RefreshCw, Camera, FileText, FileCheck, Receipt, Star,
  FileInput, GitBranch, MessageCircle,
} from "lucide-react";
import { Avatar, Sidebar as HelmUiSidebar, type NavSection } from "@helm/ui";
import { useTranslation } from "react-i18next";
import { signOut } from "@/lib/actions/auth";
import { ASK_MARK_KEYSHORTCUTS, requestAskMark } from "@/lib/ask-mark";
import { ChangePasswordModal } from "@/components/change-password-modal";
import { AvatarUploadModal } from "@/components/avatar-upload-modal";
import { LanguageToggle } from "@/components/language-toggle";
import { useAskMarkShortcutLabel } from "@/components/use-ask-mark-shortcut";

const ICON = 16;

/**
 * Real HelmSmart dashboard routes, grouped. This is the live navigation —
 * presentation (dark shell, brand-blue active state, AI badge) comes from
 * @helm/ui's <Sidebar>; the routes + plumbing stay owned by the app.
 */
const navSections: { title: string; items: { label: string; href: string; icon: ReactNode }[] }[] = [
  {
    title: "Workspace",
    items: [
      { label: "Dashboard",      href: "/home",           icon: <LayoutDashboard size={ICON} /> },
      { label: "Command Center", href: "/command-center", icon: <Bot size={ICON} /> },
      { label: "Insights",       href: "/insights",       icon: <BarChart2 size={ICON} /> },
      { label: "Inbox",          href: "/inbox",          icon: <Inbox size={ICON} /> },
      { label: "Calendar",       href: "/calendar",       icon: <Calendar size={ICON} /> },
      { label: "Tasks",          href: "/tasks",          icon: <CheckSquare size={ICON} /> },
    ],
  },
  {
    title: "Reception",
    items: [
      { label: "AI Receptionist",     href: "/voice",            icon: <PhoneIncoming size={ICON} /> },
      { label: "AI Client Assistant", href: "/client-assistant", icon: <PhoneOutgoing size={ICON} /> },
      { label: "Clients",             href: "/clients",          icon: <Users size={ICON} /> },
    ],
  },
  {
    title: "Marketing",
    items: [
      { label: "Pipeline",        href: "/pipeline",         icon: <TrendingUp size={ICON} /> },
      { label: "Social",          href: "/social",           icon: <Share2 size={ICON} /> },
      { label: "Marketing",       href: "/marketing",        icon: <Mail size={ICON} /> },
      { label: "SMS Campaigns",   href: "/marketing/sms",    icon: <MessageCircle size={ICON} /> },
      { label: "Email Campaigns", href: "/marketing/email",  icon: <Mail size={ICON} /> },
      { label: "Forms",           href: "/forms",            icon: <FileInput size={ICON} /> },
      { label: "Google Business", href: "/google",           icon: <Star size={ICON} /> },
    ],
  },
  {
    title: "Accounting",
    items: [
      { label: "Invoices", href: "/books/invoices",  icon: <FileText  size={ICON} /> },
      { label: "Quotes",   href: "/books/estimates", icon: <FileCheck size={ICON} /> },
      { label: "Bills",    href: "/books/bills",     icon: <Receipt   size={ICON} /> },
      { label: "Books",    href: "/books",           icon: <BookOpen  size={ICON} /> },
      { label: "Reports",  href: "/reports",         icon: <BarChart2 size={ICON} /> },
    ],
  },
  {
    title: "Managing",
    items: [
      { label: "Projects",    href: "/projects",    icon: <FolderOpen  size={ICON} /> },
      { label: "Timesheets",  href: "/timesheets",  icon: <Clock       size={ICON} /> },
      { label: "Workflows",   href: "/workflows",   icon: <GitBranch   size={ICON} /> },
      { label: "Automations", href: "/automations", icon: <Zap         size={ICON} /> },
      { label: "Settings",    href: "/settings",    icon: <Settings    size={ICON} /> },
    ],
  },
];

const ALL_HREFS = navSections.flatMap((s) => s.items.map((i) => i.href));

interface Props {
  unreadCount?: number;
  notificationsSlot?: ReactNode;
  userEmail?: string | null;
  /** User's uploaded profile picture (from auth metadata); falls back to an initial. */
  avatarUrl?: string | null;
  /** Pack-driven branding + nav relabeling (defaults to HelmSmart). */
  productName?: string;
  logoLetter?: string;
  terms?: Record<string, string>;
  /**
   * Mark's avatar id. When set, the sidebar shows the "Ask Mark" button, which
   * opens the Ask Mark panel the dashboard layout mounts beside it. Leave it
   * unset where no panel is mounted — a button that opens nothing is worse
   * than no button.
   */
  askMarkAvatar?: string | null;
}

export function Sidebar({ unreadCount = 0, notificationsSlot, userEmail, avatarUrl, productName = "HelmSmart", logoLetter = "H", terms = {}, askMarkAvatar }: Props) {
  const pathname = usePathname();
  const { t } = useTranslation("nav");
  const shortcut = useAskMarkShortcutLabel();

  // Longest-prefix match so e.g. /books/invoices keeps "Books" highlighted.
  const activeHref = ALL_HREFS
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  // Pack terms first ("Clients" → "Patients"), then the locale. The `nav`
  // bundle is keyed by the English label that survives the relabel, so a
  // label with no translation renders itself rather than a raw key.
  const relabel = (s: string) => {
    const term = terms[s] ?? s;
    return t(term, { defaultValue: term });
  };
  const sections: NavSection[] = navSections.map((section) => ({
    label: relabel(section.title),
    items: section.items.map((item) => ({
      label: relabel(item.label),
      href: item.href,
      icon: item.icon,
      badge:
        item.href === "/inbox" && unreadCount > 0 ? unreadCount :
        undefined,
    })),
  }));

  return (
    <HelmUiSidebar
      productName={productName}
      logoLetter={logoLetter}
      logoHref="/home"
      sections={sections}
      activeHref={activeHref}
      linkComponent={Link}
      notificationsSlot={notificationsSlot}
      aiEmployee={
        askMarkAvatar
          ? {
              name: t("askMark.button"),
              hint: t("askMark.hint", { shortcut }),
              keyShortcuts: ASK_MARK_KEYSHORTCUTS,
              icon: <Avatar id={askMarkAvatar} size={22} />,
              onClick: () => requestAskMark("open"),
            }
          : undefined
      }
      footer={userEmail ? <UserFooter userEmail={userEmail} avatarUrl={avatarUrl} /> : undefined}
      labels={{ navigation: t("menu.navigation"), openMenu: t("menu.open"), closeMenu: t("menu.close") }}
    />
  );
}

function UserFooter({ userEmail, avatarUrl }: { userEmail: string; avatarUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [picOpen, setPicOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation("nav");

  // Close the menu on an outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Language sits with the account: it is a per-person choice, and this
          is the one piece of chrome every signed-in page shares. */}
      <div style={{ display: "flex", justifyContent: "flex-start", padding: "0 4px 6px" }}>
        <LanguageToggle tone="dark" />
      </div>
      {/* The avatar chip — click it to open the account menu. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("account.menu")}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          background: "transparent", border: "none", cursor: "pointer",
          padding: 4, borderRadius: 8, textAlign: "left",
        }}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
        ) : (
          <span
            style={{
              width: 24, height: 24, borderRadius: "50%", background: "var(--brand)",
              color: "#fff", fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}
          >
            {userEmail[0]?.toUpperCase()}
          </span>
        )}
        <span
          style={{
            flex: 1, fontSize: 11, color: "rgba(255,255,255,0.5)",
            fontFamily: "Inter, system-ui, sans-serif",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {userEmail}
        </span>
        <ChevronUp
          size={14}
          style={{
            color: "rgba(255,255,255,0.4)", flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-xl border border-slate-200 shadow-xl py-1 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[11px] text-slate-400">{t("account.signedInAs")}</p>
            <p className="text-sm font-medium text-slate-800 truncate">{userEmail}</p>
          </div>
          <button
            type="button"
            onClick={() => { setPicOpen(true); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Camera size={14} /> {t("account.changePicture")}
          </button>
          <button
            type="button"
            onClick={() => { setPwOpen(true); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <KeyRound size={14} /> {t("account.changePassword")}
          </button>
          <form action={signOut}>
            <button type="submit" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
              <RefreshCw size={14} /> {t("account.switchAccount")}
            </button>
          </form>
          <div className="border-t border-slate-100 my-1" />
          <form action={signOut}>
            <button type="submit" className="flex items-center gap-2 w-full px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
              <LogOut size={14} /> {t("account.logOut")}
            </button>
          </form>
        </div>
      )}

      {pwOpen && <ChangePasswordModal onClose={() => setPwOpen(false)} />}
      {picOpen && <AvatarUploadModal currentUrl={avatarUrl} onClose={() => setPicOpen(false)} />}
    </div>
  );
}
