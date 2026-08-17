import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { getCurrentAgentContext } from "@/lib/dashboardService";
import { getOpenHouseWithVisitors } from "@/lib/open-houses/service";
import FlyerBuilderClient, { type OpenHousePrefill } from "./FlyerBuilderClient";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  return {
    title: `${t("pages.flyer.metaTitle", { ns: "dashboard" })} | CloseBoss`,
    description: t("pages.flyer.metaDescription", { ns: "dashboard" }),
  };
}

export default async function FlyerBuilderPage({
  searchParams,
}: {
  searchParams: Promise<{ openHouseId?: string | string[] }>;
}) {
  const { agentId, userId } = await getCurrentAgentContext();
  const sp = await searchParams;
  const openHouseId = Array.isArray(sp.openHouseId) ? sp.openHouseId[0] : sp.openHouseId;

  // When the agent arrives via the open-house detail page's "Print
  // flyer" button, prefill the form with that open house's data so
  // they don't have to re-enter the address, and override the QR
  // payload to encode the public sign-in URL (`/oh/<slug>`) instead
  // of the generic property-signup URL.
  let openHousePrefill: OpenHousePrefill | null = null;
  if (openHouseId && agentId) {
    try {
      const got = await getOpenHouseWithVisitors(String(agentId), openHouseId);
      if (got) {
        openHousePrefill = {
          id: got.openHouse.id,
          slug: got.openHouse.signin_slug,
          propertyAddress: got.openHouse.property_address,
          city: got.openHouse.city,
          state: got.openHouse.state,
          zip: got.openHouse.zip,
          listPrice: got.openHouse.list_price,
          mlsNumber: got.openHouse.mls_number,
          mlsUrl: got.openHouse.mls_url,
          startAt: got.openHouse.start_at,
          endAt: got.openHouse.end_at,
        };
      }
    } catch {
      // Non-fatal — fall back to the regular flyer builder picker.
    }
  }

  const { data: properties } = await supabaseServer
    .from("properties_warehouse")
    .select("id,address,city,state,zip_code")
    .order("updated_at", { ascending: false })
    .limit(50);

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <FlyerBuilderClient
        agentId={agentId || userId}
        properties={(properties ?? []) as any[]}
        openHousePrefill={openHousePrefill}
      />
    </div>
  );
}
