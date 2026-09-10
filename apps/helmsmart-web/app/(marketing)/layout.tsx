import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("site");
  // `absolute` because this string already ends in the brand. Without it the
  // root template appends " | HelmSmart" to a title that says HelmSmart —
  // which is exactly what /pricing rendered, being the one marketing page
  // with no metadata of its own to override this.
  return { title: { absolute: t("meta.marketingTitle") } };
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <MarketingNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
