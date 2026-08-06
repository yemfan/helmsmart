import type { ReactNode } from "react";
import {
  BarChart3,
  ClipboardList,
  Compass,
  Handshake,
  LayoutGrid,
  LineChart,
  PenLine,
  Phone,
  PhoneMissed,
  Presentation,
  Receipt,
  Rocket,
  Route,
  Sparkles,
  Wallet,
  DoorOpen,
} from "lucide-react";

/**
 * Each AI employee's "Actions" — the things it can do for the agent. These feed
 * BOTH the per-employee Actions hub page (components/dashboard/ActionsHub) and
 * the sidebar (nav.config): the sidebar shows Overview + Actions per employee
 * (2 levels max), and the individual actions are nested inside the Actions page.
 */

const IC = 20;
const S = 1.75;

export type TeamAction = {
  label: string;
  href: string;
  desc: string;
  icon: ReactNode;
};

export type TeamMemberActions = {
  key: string;
  title: string;
  overviewHref: string;
  actions: TeamAction[];
  /** Routes that should keep this employee's "Actions" row highlighted. */
  actionMatch: string[];
};

function build(m: Omit<TeamMemberActions, "actionMatch">): TeamMemberActions {
  return { ...m, actionMatch: [`${m.overviewHref}/actions`, ...m.actions.map((a) => a.href)] };
}

export const TEAM_ACTIONS: Record<string, TeamMemberActions> = {
  receptionist: build({
    key: "receptionist",
    title: "Receptionist",
    overviewHref: "/dashboard/ai-receptionist",
    actions: [
      { label: "Call Log", href: "/dashboard/calls", desc: "Every call the receptionist answered, with recordings and summaries.", icon: <Phone size={IC} strokeWidth={S} /> },
      { label: "Missed Calls", href: "/dashboard/missed-call", desc: "Missed calls and the AI text-backs that recovered them.", icon: <PhoneMissed size={IC} strokeWidth={S} /> },
    ],
  }),
  sales: build({
    key: "sales",
    title: "Sales Assistant",
    overviewHref: "/dashboard/ai-sales-assistant",
    actions: [
      { label: "Open Houses", href: "/dashboard/open-houses", desc: "Host and follow up on open houses; sign-ins become leads.", icon: <DoorOpen size={IC} strokeWidth={S} /> },
      { label: "House Search", href: "/dashboard/house-search", desc: "Run an AI home search for a buyer and email the matches.", icon: <Compass size={IC} strokeWidth={S} /> },
      { label: "Deep Report", href: "/dashboard/deep-report", desc: "Buyer-decision deep report: value, ROI, schools, neighborhood.", icon: <BarChart3 size={IC} strokeWidth={S} /> },
      { label: "CMA", href: "/dashboard/cma", desc: "AI comparative market analysis to price a home.", icon: <BarChart3 size={IC} strokeWidth={S} /> },
      { label: "Seller Presentation", href: "/dashboard/presentations", desc: "Win-the-listing pitch deck, built from the CMA.", icon: <Presentation size={IC} strokeWidth={S} /> },
      { label: "Growth", href: "/dashboard/growth", desc: "Pipeline insights — where your next opportunities are.", icon: <Rocket size={IC} strokeWidth={S} /> },
    ],
  }),
  marketing: build({
    key: "marketing",
    title: "Marketing Assistant",
    overviewHref: "/dashboard/ai-marketing-assistant",
    actions: [
      { label: "Drafts", href: "/dashboard/drafts", desc: "Approve nurture messages before they send.", icon: <PenLine size={IC} strokeWidth={S} /> },
      { label: "Marketing Plans", href: "/dashboard/marketing/plans", desc: "Marketing plans and sphere monetization.", icon: <Route size={IC} strokeWidth={S} /> },
      { label: "Templates", href: "/dashboard/templates", desc: "Reusable message and campaign templates.", icon: <ClipboardList size={IC} strokeWidth={S} /> },
      { label: "Generate Leads", href: "/dashboard/leads/generate", desc: "AI lead-generation ideas for this week.", icon: <Sparkles size={IC} strokeWidth={S} /> },
      { label: "Lead Source ROI", href: "/dashboard/lead-source-roi", desc: "Which lead sources actually produce revenue.", icon: <LineChart size={IC} strokeWidth={S} /> },
    ],
  }),
  transaction: build({
    key: "transaction",
    title: "Transaction Assistant",
    overviewHref: "/dashboard/ai-transaction-assistant",
    actions: [
      { label: "Coordinator Board", href: "/dashboard/transactions/coordinator", desc: "Track every deal's tasks to the closing table.", icon: <LayoutGrid size={IC} strokeWidth={S} /> },
      { label: "Deal Coach", href: "/dashboard/deal-coach", desc: "Per-deal AI coach: pricing, risk, negotiation scripts.", icon: <Handshake size={IC} strokeWidth={S} /> },
    ],
  }),
  accountant: build({
    key: "accountant",
    title: "Accountant",
    overviewHref: "/dashboard/ai-accountant",
    actions: [
      { label: "Invoices", href: "/dashboard/books", desc: "Create and track invoices.", icon: <Receipt size={IC} strokeWidth={S} /> },
      { label: "Expenses", href: "/dashboard/expenses", desc: "Log and categorize expenses.", icon: <Wallet size={IC} strokeWidth={S} /> },
    ],
  }),
};
