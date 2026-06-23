import type { Metadata } from "next";
import { notFound } from "next/navigation";

import IdxDisclaimer from "@/components/idx/IdxDisclaimer";
import IdxLeadActions from "@/components/idx/IdxLeadActions";
import IdxViewTracker from "@/components/idx/IdxViewTracker";
import { buildMlsAttribution, getIdxAdapter, isIdxFailure } from "@/lib/idx";

function formatPrice(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "Price on request";
  return `$${Math.round(n).toLocaleString()}`;
}

function formatNumber(n: number | null, suffix = ""): string | null {
  if (n === null || !Number.isFinite(n)) return null;
  return `${Math.round(n).toLocaleString()}${suffix}`;
}

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  // IDX listing detail pages are external MLS data (duplicate of the source),
  // go stale/404 as listings sell, and the underlying feed is being retired.
  // Keep them out of the index so they don't accumulate as soft-404 / "crawled,
  // not indexed" in GSC.
  const robots = { index: false, follow: false } as const;
  const adapter = getIdxAdapter();
  const result = await adapter.getListing(id);
  if (isIdxFailure(result)) {
    return { title: "Listing | RealtorBoss", robots };
  }
  const l = result.data;
  return {
    title: `${l.formattedAddress} | RealtorBoss`,
    description: l.description ?? `${l.beds ?? "?"} bed ${l.baths ?? "?"} bath home for sale at ${l.formattedAddress}.`,
    robots,
  };
}

export default async function ListingDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const adapter = getIdxAdapter();
  const result = await adapter.getListing(id);

  if (isIdxFailure(result)) {
    if (result.error.kind === "not_found") notFound();
    return (
      <main className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          We couldn&apos;t load this listing right now. Please try again shortly.
        </div>
      </main>
    );
  }

  const l = result.data;
  const attribution = buildMlsAttribution({
    mlsName: l.mlsName,
    listingBrokerName: l.listingBrokerName,
  });

  const facts: { label: string; value: string }[] = [
    { label: "Beds", value: formatNumber(l.beds) ?? "—" },
    { label: "Baths", value: formatNumber(l.baths) ?? "—" },
    { label: "Sqft", value: formatNumber(l.sqft) ?? "—" },
    { label: "Lot", value: formatNumber(l.lotSize, " sqft") ?? "—" },
    { label: "Year built", value: l.yearBuilt ? String(l.yearBuilt) : "—" },
    { label: "Type", value: l.propertyType ? l.propertyType.replace("_", " ") : "—" },
  ];

  const photos = l.photos.length > 0 ? l.photos : l.heroPhoto ? [l.heroPhoto] : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <IdxViewTracker
        listingId={l.id}
        listingAddress={l.formattedAddress}
        listingPrice={l.price}
      />

      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            {formatPrice(l.price)}
          </h1>
          <div className="mt-1 text-base text-slate-700">{l.formattedAddress}</div>
          <div className="text-sm text-slate-500">
            {[l.city, l.state, l.zip].filter(Boolean).join(", ")}
          </div>
        </div>
        <div className="text-sm text-slate-600">
          {l.status !== "active" ? (
            <span className="rounded-full bg-slate-900 px-2 py-1 text-[10px] font-semibold uppercase text-white">
              {l.status.replace("_", " ")}
            </span>
          ) : (
            <span className="text-emerald-700">Active</span>
          )}
          {l.daysOnMarket !== null ? (
            <span className="ml-2">· {l.daysOnMarket} days on market</span>
          ) : null}
        </div>
      </header>

      {photos.length > 0 ? (
        <section className="mt-6 grid gap-2 sm:grid-cols-3">
          <div className="sm:col-span-2 sm:row-span-2 overflow-hidden rounded-2xl bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[0]}
              alt={`${l.formattedAddress} primary photo`}
              className="h-full w-full object-cover"
            />
          </div>
          {photos.slice(1, 5).map((url, i) => (
            <div key={i} className="aspect-[4/3] overflow-hidden rounded-2xl bg-slate-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`${l.formattedAddress} photo ${i + 2}`} className="h-full w-full object-cover" />
            </div>
          ))}
        </section>
      ) : (
        <section className="mt-6 rounded-2xl bg-slate-100 p-12 text-center text-sm text-slate-500">
          No photos available for this listing.
        </section>
      )}

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Property facts</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {f.label}
                  </dt>
                  <dd className="text-sm text-slate-900">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {l.description ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-base font-semibold text-slate-900">About this home</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {l.description}
              </p>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-semibold text-slate-900">Interested in this home?</h2>
            <p className="mt-1 text-sm text-slate-600">
              Connect with a local agent for a tour or quick answers.
            </p>
            <div className="mt-4">
              <IdxLeadActions
                listingId={l.id}
                listingAddress={l.formattedAddress}
                listingPrice={l.price}
              />
            </div>
          </div>
          <p className="px-1 text-[11px] leading-relaxed text-slate-500">{attribution}</p>
        </aside>
      </section>

      <IdxDisclaimer />
    </main>
  );
}
