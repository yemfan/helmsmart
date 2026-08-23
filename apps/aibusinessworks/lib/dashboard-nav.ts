export const PARTNER_NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/customers", label: "Customers" },
  { href: "/dashboard/commissions", label: "Commissions" },
  { href: "/dashboard/partners", label: "Direct Partners" },
  { href: "/dashboard/links", label: "Links & Codes" },
  { href: "/dashboard/academy", label: "Academy" },
  { href: "/dashboard/resources", label: "Resources" },
  { href: "/dashboard/profile", label: "Profile" },
] as const;

export const ADMIN_NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/commissions", label: "Commissions" },
  { href: "/admin/compensation", label: "Compensation" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/audit", label: "Audit" },
] as const;
