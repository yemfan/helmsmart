"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { intlLocale } from "@/lib/i18n/locale";
import { Heart } from "lucide-react";
import { LoadingText } from "@/components/ui/LoadingText";

type Favorite = {
  id: string;
  propertyId: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  photoUrl: string | null;
  createdAt: string;
};

type Props = {
  contactId: string;
};

function money(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}K`;
  return `$${Math.round(v)}`;
}

/**
 * Agent-side read-only panel: "Properties this contact favorited."
 * Lives below SavedSearchesPanel on the contact profile. Gives the
 * agent the strongest consumer-declared interest signal — if the
 * contact hearted a specific listing, the agent knows exactly what
 * to bring up on the next call.
 */
export default function FavoritesPanel({ contactId }: Props) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = intlLocale(i18n.language);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/dashboard/contacts/${encodeURIComponent(contactId)}/favorites`,
        );
        if (cancelled) return;
        const data = (await res.json()) as { ok?: boolean; favorites?: Favorite[] };
        if (res.ok && data.ok) setFavorites(data.favorites ?? []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">{t("pages.favorites.title")}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t("pages.favorites.sub")}</p>
        </div>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700">
          {favorites.length}
        </span>
      </div>

      {loading ? (
        <div className="mt-3 text-xs text-gray-400"><LoadingText /></div>
      ) : favorites.length === 0 ? (
        <div className="mt-3 rounded border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
          <Heart className="mx-auto h-5 w-5 text-gray-300" aria-hidden />
          <div className="mt-1">{t("pages.favorites.empty")}</div>
        </div>
      ) : (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {favorites.map((f) => (
            <li
              key={f.id}
              className="overflow-hidden rounded-lg border border-gray-200"
            >
              <div className="relative h-24 bg-gray-100">
                {f.photoUrl ? (
                  <img
                    src={f.photoUrl}
                    alt={f.address ?? ""}
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="p-2">
                <div className="text-sm font-semibold text-gray-900">{money(f.price)}</div>
                <div className="truncate text-[11px] text-gray-600">
                  {f.address ?? t("pages.favorites.addressUnavailable")}
                </div>
                {(f.beds || f.baths || f.sqft) && (
                  <div className="mt-0.5 text-[10px] text-gray-400">
                    {[
                      f.beds ? `${f.beds}bd` : null,
                      f.baths ? `${f.baths}ba` : null,
                      f.sqft ? `${f.sqft.toLocaleString()}sf` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
                <div className="mt-0.5 text-[10px] text-gray-400">
                  {t("pages.favorites.saved", { date: new Date(f.createdAt).toLocaleDateString(locale) })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
