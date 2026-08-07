import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Billing moved into the consolidated Settings page. Forward any Stripe
 * `?status` (e.g. cancel) so its banner still shows on the Billing tab.
 */
export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = sp.status ? `&status=${encodeURIComponent(sp.status)}` : "";
  redirect(`/settings?tab=billing${status}`);
}
