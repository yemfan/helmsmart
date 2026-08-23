import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  Settings,
  Shield,
  Users,
  Wrench,
} from "lucide-react";
import type { PlatformNavSection, PlatformRole } from "./types";

const agent: PlatformNavSection[] = [
  {
    items: [
      { href: "/agent/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/leads", label: "Leads", icon: Users },
      { href: "/dashboard/opportunities", label: "Pipeline", icon: LineChart },
      { href: "/dashboard/contacts", label: "Clients", icon: MessageSquare },
      { href: "/dashboard/tools", label: "AI Tools", icon: Wrench },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

const support: PlatformNavSection[] = [
  {
    items: [
      { href: "/support/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/support", label: "Tickets", icon: Shield },
      { href: "/dashboard/support", label: "Conversations", icon: MessageSquare },
      { href: "/admin/support", label: "Issues", icon: Wrench },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

const admin: PlatformNavSection[] = [
  {
    items: [
      { href: "/admin/platform-overview", label: "Platform Overview", icon: LayoutDashboard },
      { href: "/admin/billing", label: "Billing", icon: CreditCard },
      { href: "/dashboard/reports", label: "Reports", icon: BarChart3 },
      { href: "/admin/support", label: "System Logs", icon: Shield },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function getPlatformNav(role: PlatformRole): PlatformNavSection[] {
  switch (role) {
    case "agent":
      return agent;
    case "support":
      return support;
    case "admin":
      return admin;
    default:
      return agent;
  }
}
