import { redirect } from "next/navigation";

// CloseBoss moved to usage-based pricing — the Credits page is the billing
// surface now. Redirect the old billing route (and anything that still links to
// it, e.g. subscriptionRequiredResponse's billingPath) to /dashboard/credits.
export default function DashboardBillingPage() {
  redirect("/dashboard/credits");
}
