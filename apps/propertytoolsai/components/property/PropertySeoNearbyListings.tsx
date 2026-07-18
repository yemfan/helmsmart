"use client";

import React from "react";
import type { PropertySeoRecord } from "@/lib/property-seo/types";

function money(value?: number) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function PropertySeoNearbyListings({ record }: { record: PropertySeoRecord }) {
  return (
    <section className="rounded-3xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">Nearby homes for sale</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {record.nearbyListings.map((listing) => {
          const body = (
            <>
              {listing.photoUrl ? (
                <img
                  src={listing.photoUrl}
                  alt={listing.address}
                  className="h-[180px] w-full object-cover"
                />
              ) : null}
              <div className="p-4">
                <div className="font-semibold text-gray-900">{money(listing.price)}</div>
                <div className="mt-1 text-sm text-gray-700">{listing.address}</div>
                <div className="mt-2 text-xs text-gray-500">
                  {listing.beds ?? "—"} bd • {listing.baths ?? "—"} ba •{" "}
                  {listing.sqft?.toLocaleString() || "—"} sqft
                </div>
              </div>
            </>
          );
          // AI-sourced listings link out to their source; entries without a
          // URL render as plain, non-clickable cards (no internal PDP exists).
          return listing.listingUrl ? (
            <a
              key={listing.id}
              href={listing.listingUrl}
              target="_blank"
              rel="noopener nofollow"
              className="overflow-hidden rounded-2xl border bg-gray-50 transition hover:bg-white"
            >
              {body}
            </a>
          ) : (
            <div
              key={listing.id}
              className="overflow-hidden rounded-2xl border bg-gray-50"
            >
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
