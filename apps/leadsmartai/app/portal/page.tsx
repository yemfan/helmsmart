import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { getProfessionalPortalPath } from "@/lib/rolePortalPaths";
import type { Metadata } from "next";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT();
  const title = t("routeMeta.billingPortal.title", { ns: "web_marketing" });
  const description = t("routeMeta.billingPortal.description", { ns: "web_marketing" });
  return {
  title,
  description,
  keywords: ["billing portal", "subscription", "invoices"],
  robots: { index: false },
};
}

export const dynamic = "force-dynamic";

/**
 * /portal — smart role-based redirect to the right portal hub.
 *
 *  agent                    → /agent
 *  broker / managing_broker → /broker
 *  admin / support          → /admin
 *  unauthenticated          → /login?redirect=/portal
 */
export default async function PortalRedirectPage() {
  const supabase = supabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/portal");
  }

  let role: string | null = null;
  let hasAgentRow = false;

  try {
    const [{ data: lu }, { data: ag }] = await Promise.all([
      supabaseAdmin
        .from("leadsmart_users")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabaseAdmin
        .from("agents")
        .select("id")
        .eq("auth_user_id", user.id)
        .maybeSingle(),
    ]);
    role = (lu as { role?: string } | null)?.role ?? null;
    hasAgentRow = ag !== null;
  } catch {
    // Non-fatal — fall through to default
  }

  redirect(getProfessionalPortalPath(role, hasAgentRow));
}
