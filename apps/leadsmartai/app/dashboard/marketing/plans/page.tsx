import MarketingPlansTabs from "./MarketingPlansTabs";
import { getServerT } from "@/lib/i18n/server";

export const metadata = {
  title: "Marketing Plans",
  description:
    "Create, customize, and manage automated marketing plans — and monetize your sphere.",
};

export default async function MarketingPlansPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const t = await getServerT();
  const { tab } = await searchParams;
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <MarketingPlansTabs initialTab={tab === "sphere" ? "sphere" : "plans"} />
    </div>
  );
}
