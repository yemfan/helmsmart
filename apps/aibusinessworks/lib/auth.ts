import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";

export interface PartnerAccount {
  id: string;
  userId: string;
  email: string;
  partnerCode: string;
  slug: string;
  firstName: string;
  lastName: string;
  status: "pending" | "active" | "suspended" | "terminated";
  levelKey: string | null;
  sponsorPartnerId: string | null;
  goodStanding: boolean;
  academyLeadershipCompletedAt: string | null;
  leaderQualifiedAt: string | null;
  productInterests: string[];
  businessName: string | null;
  country: string | null;
  stateProvince: string | null;
  phone: string | null;
  website: string | null;
  primaryMarket: string | null;
  industry: string | null;
}

interface PartnerRow {
  id: string;
  user_id: string;
  email: string;
  partner_code: string;
  slug: string;
  first_name: string;
  last_name: string;
  status: PartnerAccount["status"];
  level_key: string | null;
  sponsor_partner_id: string | null;
  good_standing: boolean;
  academy_leadership_completed_at: string | null;
  leader_qualified_at: string | null;
  product_interests: string[] | null;
  business_name: string | null;
  country: string | null;
  state_province: string | null;
  phone: string | null;
  website: string | null;
  primary_market: string | null;
  industry: string | null;
}

function toAccount(row: PartnerRow): PartnerAccount {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    partnerCode: row.partner_code,
    slug: row.slug,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status,
    levelKey: row.level_key,
    sponsorPartnerId: row.sponsor_partner_id,
    goodStanding: row.good_standing,
    academyLeadershipCompletedAt: row.academy_leadership_completed_at,
    leaderQualifiedAt: row.leader_qualified_at,
    productInterests: row.product_interests ?? [],
    businessName: row.business_name,
    country: row.country,
    stateProvince: row.state_province,
    phone: row.phone,
    website: row.website,
    primaryMarket: row.primary_market,
    industry: row.industry,
  };
}

/** The signed-in partner, or null. Never throws - callers decide what to do. */
export const getCurrentPartner = cache(async (): Promise<PartnerAccount | null> => {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data } = await supabase
      .from("abw_partners")
      .select(
        "id, user_id, email, partner_code, slug, first_name, last_name, status, level_key, sponsor_partner_id, good_standing, academy_leadership_completed_at, leader_qualified_at, product_interests, business_name, country, state_province, phone, website, primary_market, industry",
      )
      .eq("user_id", user.id)
      .maybeSingle();

    return data ? toAccount(data as PartnerRow) : null;
  } catch {
    return null;
  }
});

/** Guard for partner-only routes. */
export async function requirePartner(redirectTo = "/dashboard"): Promise<PartnerAccount> {
  const partner = await getCurrentPartner();
  if (!partner) redirect(`/login?next=${encodeURIComponent(redirectTo)}`);
  return partner;
}

export const isAdmin = cache(async (): Promise<boolean> => {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("abw_admin_users")
      .select("user_id, role")
      .eq("user_id", user.id)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
});

/** Guard for admin routes. Returns the admin's user id. */
export async function requireAdmin(): Promise<string> {
  if (!isSupabaseConfigured()) redirect("/login?next=/admin");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const { data } = await supabase
    .from("abw_admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) redirect("/dashboard");
  return user.id;
}

/** Admin check for route handlers, which redirect differently from pages. */
export async function assertAdminForApi(): Promise<
  { ok: true; userId: string; email: string } | { ok: false; status: number; message: string }
> {
  if (!isSupabaseConfigured()) {
    return { ok: false, status: 503, message: "The platform is not connected to a database yet." };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, status: 401, message: "Sign in to continue." };

  const { data } = await supabase
    .from("abw_admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!data) return { ok: false, status: 403, message: "This action requires an administrator." };
  return { ok: true, userId: user.id, email: user.email ?? "" };
}
