import type { Metadata } from "next";
import Link from "next/link";
import { isAdmin, requirePartner } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { RESOURCES, RESOURCE_CATEGORIES, type ResourceItem } from "@/content/resources";
import { productByKey } from "@/content/products";
import { PARTNER_NAV } from "@/lib/dashboard-nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { Badge, Card } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Resources" };

const FORMAT_LABEL: Record<string, string> = {
  deck: "Deck",
  document: "Document",
  template: "Templates",
  graphics: "Graphics",
  video: "Video",
  tool: "Tool",
};

export default async function ResourcesDashboardPage() {
  const partner = await requirePartner("/dashboard/resources");
  const admin = await isAdmin();

  // Published URLs come from the database so materials can be swapped without a
  // deploy; the catalogue itself falls back to the bundled list.
  const urls = new Map<string, string>();
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("abw_resources")
        .select("key, url")
        .eq("is_published", true);
      for (const row of data ?? []) {
        if (row.url) urls.set(row.key as string, row.url as string);
      }
    } catch {
      // Fall back to the catalogue with no download links.
    }
  }

  const locked = partner.status !== "active";

  return (
    <DashboardShell
      nav={[...PARTNER_NAV]}
      isAdmin={admin}
      title="Resources"
      subtitle="Decks, demos, templates and brand assets. Written to the Marketing Guidelines, so using them keeps you compliant by default."
    >
      <div className="space-y-8">
        {locked ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            Downloads open once your Partner account is approved. You can review the catalogue in
            the meantime.
          </div>
        ) : null}

        {RESOURCE_CATEGORIES.map((category) => {
          const items = RESOURCES.filter((r) => r.category === category.key);
          if (!items.length) return null;
          return (
            <section key={category.key}>
              <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
                {category.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{category.detail}</p>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <li key={item.key}>
                    <ResourceCard item={item} url={urls.get(item.key)} locked={locked} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <Disclaimer>
          These materials are licensed for promoting AI Business Works products while your Partner
          account is active. Do not alter logos or claims.{" "}
          <Link href="/marketing-guidelines" className="underline underline-offset-4">
            Read the Marketing Guidelines
          </Link>{" "}
          before you publish anything of your own.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

function ResourceCard({
  item,
  url,
  locked,
}: {
  item: ResourceItem;
  url?: string;
  locked: boolean;
}) {
  const product = item.productKey ? productByKey(item.productKey) : null;

  return (
    <Card className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{FORMAT_LABEL[item.format] ?? item.format}</Badge>
        {product ? <Badge tone="cyan">{product.name}</Badge> : null}
      </div>
      <h3 className="mt-4 font-display text-base font-semibold tracking-tight text-ink">
        {item.title}
      </h3>
      <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">{item.description}</p>

      <div className="mt-5">
        {item.key === "referral-links" ? (
          <Link
            href="/dashboard/links"
            className="inline-flex rounded-xl border border-hairline bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:border-navy-300"
          >
            Open your links
          </Link>
        ) : locked ? (
          <span className="text-xs font-medium text-muted">Available once approved</span>
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex rounded-xl border border-hairline bg-white px-4 py-2 text-sm font-semibold text-navy-700 hover:border-navy-300"
          >
            Open
          </a>
        ) : (
          <span className="text-xs font-medium text-muted">Publishing soon</span>
        )}
      </div>
    </Card>
  );
}
