"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Banknote,
  Briefcase,
  Calendar,
  ChartBar,
  ChevronRight,
  ClipboardCheck,
  Coins,
  FileText,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  LineChart,
  LogOut,
  MessagesSquare,
  Network,
  Phone,
  Plug,
  RefreshCcw,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UserCircle2,
  Users,
} from "lucide-react";
import {
  faKpis,
  faProspects,
  faRecruits,
} from "@/lib/financial-services-demo-data";
import { getFinancialServicesTheme } from "@/lib/financial-services/theme";
import { useTranslation } from "react-i18next";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Optional badge count shown on the right. */
  badge?: number;
  /** Soft badge meaning "coming soon". */
  comingSoon?: boolean;
};

type NavSection = {
  title: string;
  items: NavItem[];
  /** Only visible to managing-director-tier and above (uplines). */
  mdOnly?: boolean;
};

function buildSections(): NavSection[] {
  const prospectCount = faProspects.length;
  const fnaCount = Number(faKpis.find((k) => k.label === "FNAs completed")?.value ?? 0) || 19;
  const recruitCount = faRecruits.length;
  const apptCount = Number(faKpis.find((k) => k.label === "Kitchen-table appts")?.value ?? 0) || 11;

  return [
    {
      title: "WORKSPACE",
      items: [
        {
          href: "/financial-services/dashboard/overview",
          label: "Dashboard",
          icon: LayoutDashboard,
        },
      ],
    },
    {
      title: "PIPELINE",
      items: [
        {
          href: "/financial-services/dashboard/prospects",
          label: "Prospects",
          icon: Users,
          badge: prospectCount * 12, // scale demo data toward the 62-active number
        },
        {
          href: "/financial-services/dashboard/sit-downs",
          label: "Sit-Downs",
          icon: Calendar,
          badge: apptCount,
        },
        {
          href: "/financial-services/dashboard/fna",
          label: "FNAs",
          icon: Sparkles,
          badge: fnaCount,
        },
      ],
    },
    {
      title: "BUILD",
      items: [
        {
          href: "/financial-services/dashboard/recruits",
          label: "New Associates",
          icon: Network,
          badge: recruitCount + 20,
        },
        {
          href: "/financial-services/dashboard/bpms",
          label: "BPMs",
          icon: ClipboardCheck,
          comingSoon: true,
        },
        {
          href: "/financial-services/dashboard/field-training",
          label: "Field Training",
          icon: GraduationCap,
          comingSoon: true,
        },
      ],
    },
    {
      title: "COMMS",
      items: [
        {
          href: "/financial-services/dashboard/inbox",
          label: "Inbox",
          icon: Inbox,
          badge: 7,
          comingSoon: true,
        },
        {
          href: "/financial-services/dashboard/templates",
          label: "Scripts",
          icon: ScrollText,
        },
        {
          href: "/financial-services/dashboard/dials",
          label: "Dials",
          icon: Phone,
          comingSoon: true,
        },
      ],
    },
    {
      title: "BOOK OF BUSINESS",
      items: [
        {
          href: "/financial-services/dashboard/policyholders",
          label: "Policyholders",
          icon: Briefcase,
          comingSoon: true,
        },
        {
          href: "/financial-services/dashboard/annual-reviews",
          label: "Annual Reviews",
          icon: RefreshCcw,
          badge: 5,
          comingSoon: true,
        },
      ],
    },
    {
      title: "MY TEAM",
      mdOnly: true,
      items: [
        {
          href: "/financial-services/dashboard/downline",
          label: "Downline",
          icon: Users,
          comingSoon: true,
        },
        {
          href: "/financial-services/dashboard/overrides",
          label: "Overrides",
          icon: Coins,
          comingSoon: true,
        },
        {
          href: "/financial-services/dashboard/production",
          label: "Production",
          icon: ChartBar,
          comingSoon: true,
        },
      ],
    },
    {
      title: "SETTINGS",
      items: [
        {
          href: "/financial-services/dashboard/compliance",
          label: "Compliance",
          icon: ShieldCheck,
          comingSoon: true,
        },
        {
          href: "/financial-services/dashboard/integrations",
          label: "Integrations",
          icon: Plug,
          comingSoon: true,
        },
        {
          href: "/financial-services/dashboard/profile",
          label: "Profile",
          icon: UserCircle2,
          comingSoon: true,
        },
      ],
    },
  ];
}

/** Map the dark-bg accentText class to a light-bg variant for the sidebar. */
function lightAccentText(accent: string): string {
  if (accent.includes("amber")) return "text-amber-600";
  if (accent.includes("red")) return "text-red-600";
  if (accent.includes("emerald")) return "text-emerald-600";
  return "text-indigo-600";
}

/** Active item left-edge accent strip, theme-aware. */
function activeStripBg(accent: string): string {
  if (accent.includes("amber")) return "bg-amber-500";
  if (accent.includes("red")) return "bg-red-500";
  if (accent.includes("emerald")) return "bg-emerald-500";
  return "bg-indigo-500";
}

/** Active item icon tint, theme-aware. */
function activeIconClass(accent: string): string {
  if (accent.includes("amber")) return "text-amber-700";
  if (accent.includes("red")) return "text-red-700";
  if (accent.includes("emerald")) return "text-emerald-700";
  return "text-indigo-700";
}

export default function FinancialServicesSidebar({
  email,
  /** If true, the MD-only section ("MY TEAM") is shown. Demo defaults to true. */
  showTeamSection = true,
}: {
  email: string | null;
  showTeamSection?: boolean;
}) {
  const { t } = useTranslation("dashboard");
  const theme = getFinancialServicesTheme();
  const pathname = usePathname() ?? "";
  const sections = buildSections().filter((s) => !s.mdOnly || showTeamSection);

  const accentText = lightAccentText(theme.accentText);
  const stripBg = activeStripBg(theme.accentText);
  const activeIcon = activeIconClass(theme.accentText);

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
      {/* Brand */}
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-5">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${
            theme.partnerName === "GFI"
              ? "from-blue-900 to-blue-700"
              : theme.partnerName === "WFG"
                ? "from-red-900 to-red-700"
                : theme.partnerName === "PFO"
                  ? "from-emerald-900 to-emerald-700"
                  : "from-indigo-900 to-violet-700"
          }`}
        >
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wider text-slate-500">CloseBoss AI</p>
          {theme.partnerName ? (
            <p className={`truncate text-sm font-bold ${accentText}`}>
              {theme.partnerName}
            </p>
          ) : (
            <p className="truncate text-sm font-bold text-slate-900">{t("pages.financialServices.section")}</p>
          )}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-6 last:mb-0">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={[
                        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                        active
                          ? "bg-slate-100 font-semibold text-slate-900"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                      ].join(" ")}
                    >
                      {active && (
                        <span
                          className={`absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r ${stripBg}`}
                          aria-hidden
                        />
                      )}
                      <Icon
                        className={[
                          "h-4 w-4 shrink-0",
                          active ? activeIcon : "text-slate-400 group-hover:text-slate-600",
                        ].join(" ")}
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.comingSoon ? (
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-slate-500">{t("pages.financialServices.soon")}</span>
                      ) : item.badge != null ? (
                        <span
                          className={[
                            "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                            active
                              ? "bg-white text-slate-700"
                              : "bg-slate-100 text-slate-600",
                          ].join(" ")}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-100 px-3 py-3">
        <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs">
          <UserCircle2 className="h-7 w-7 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-slate-700">{email ?? "Producer"}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{t("pages.financialServices.producer")}</p>
          </div>
          <Link
            href="/logout"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label={t("pages.financialServices.signOut")}
          >
            <LogOut className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <UnusedIconKeeper />
    </aside>
  );
}

/** Touch unused icons so tree-shaking keeps them available for swaps. */
function UnusedIconKeeper() {
  void [Banknote, ChevronRight, FileText, LineChart, MessagesSquare];
  return null;
}
