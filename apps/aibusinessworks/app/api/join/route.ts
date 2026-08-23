import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { generatePartnerCode, generateReferralCode, hashIp, partnerSlug } from "@/lib/ids";
import { REFERRAL_COOKIE, parseReferralCookie } from "@/lib/referrals";
import { LEGAL_DOCUMENTS } from "@/content/legal";

/** Fields the registration form sends. Everything else is set by the server. */
interface JoinPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
  phone?: string;
  country?: string;
  stateProvince?: string;
  businessName?: string;
  industry?: string;
  website?: string;
  primaryMarket?: string;
  heardAbout?: string;
  productInterests?: string[];
  acceptedTerms?: boolean;
}

const REQUIRED_AGREEMENTS = ["partner-terms", "privacy", "marketing-guidelines"];

function fail(message: string, status = 400, field?: string) {
  return NextResponse.json({ ok: false, message, field }, { status });
}

function clean(value: unknown, max = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

export async function POST(request: NextRequest) {
  if (!hasServiceRole()) {
    return fail(
      "Registration is not available yet: this deployment is not connected to a database. Please try again shortly.",
      503,
    );
  }

  let payload: JoinPayload;
  try {
    payload = (await request.json()) as JoinPayload;
  } catch {
    return fail("We could not read that submission. Please try again.");
  }

  const firstName = clean(payload.firstName, 80);
  const lastName = clean(payload.lastName, 80);
  const email = clean(payload.email, 200)?.toLowerCase() ?? null;
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!firstName) return fail("Please enter your first name.", 400, "firstName");
  if (!lastName) return fail("Please enter your last name.", 400, "lastName");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return fail("Please enter a valid email address.", 400, "email");
  }
  if (password.length < 10) {
    return fail("Please choose a password of at least 10 characters.", 400, "password");
  }
  if (!payload.acceptedTerms) {
    return fail(
      "Please confirm you agree to the Partner Program Terms, Privacy Policy and Marketing Guidelines.",
      400,
      "acceptedTerms",
    );
  }

  const supabase = createAdminClient();

  // Reject a duplicate before creating an auth user, so a retry is clean.
  const { data: existing } = await supabase
    .from("abw_partners")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    return fail(
      "There is already a Partner account with that email address. Try logging in, or reset your password.",
      409,
      "email",
    );
  }

  // Resolve the sponsor from the referral cookie, if one is present and valid.
  const claim = parseReferralCookie(request.cookies.get(REFERRAL_COOKIE)?.value);
  let sponsorPartnerId: string | null = null;
  if (claim) {
    const { data: sponsorCode } = await supabase
      .from("abw_referral_codes")
      .select("partner_id, abw_partners!inner(status)")
      .eq("code", claim.code)
      .eq("is_active", true)
      .maybeSingle();
    const sponsorStatus = (sponsorCode as { abw_partners?: { status?: string } } | null)
      ?.abw_partners?.status;
    if (sponsorCode?.partner_id && sponsorStatus === "active") {
      sponsorPartnerId = sponsorCode.partner_id as string;
    }
  }

  const { data: created, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name: firstName, last_name: lastName },
  });

  if (authError || !created.user) {
    const duplicate = authError?.message?.toLowerCase().includes("already");
    return fail(
      duplicate
        ? "There is already an account with that email address. Try logging in instead."
        : "We could not create the account. Please try again, or contact us if it keeps happening.",
      duplicate ? 409 : 500,
      duplicate ? "email" : undefined,
    );
  }

  const userId = created.user.id;
  const partnerCode = generatePartnerCode();
  const slug = partnerSlug(firstName, lastName);
  const interests = Array.isArray(payload.productInterests)
    ? payload.productInterests.filter((p) => typeof p === "string").slice(0, 8)
    : [];

  const { data: partner, error: partnerError } = await supabase
    .from("abw_partners")
    .insert({
      user_id: userId,
      partner_code: partnerCode,
      slug,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: clean(payload.phone, 40),
      country: clean(payload.country, 80),
      state_province: clean(payload.stateProvince, 80),
      business_name: clean(payload.businessName, 160),
      industry: clean(payload.industry, 80),
      website: clean(payload.website, 200),
      primary_market: clean(payload.primaryMarket, 160),
      heard_about: clean(payload.heardAbout, 200),
      product_interests: interests,
      // Applications start pending. An administrator approves them.
      status: "pending",
      sponsor_partner_id: sponsorPartnerId,
      sponsored_at: sponsorPartnerId ? new Date().toISOString() : null,
    })
    .select("id")
    .single();

  if (partnerError || !partner) {
    // Do not leave an orphan auth user behind if the profile insert failed.
    await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
    return fail(
      "We created your login but could not finish your Partner profile. Please try again.",
      500,
    );
  }

  const partnerId = partner.id as string;
  const ipHash = hashIp(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null);

  // Sponsor history, referral code, discount code, agreements and audit trail.
  await Promise.all([
    supabase.from("abw_partner_relationships").insert({
      partner_id: partnerId,
      sponsor_partner_id: sponsorPartnerId,
      generation_level: 1,
      reason: sponsorPartnerId ? `Referral code ${claim?.code}` : "Direct registration",
    }),
    supabase.from("abw_referral_codes").insert([
      { partner_id: partnerId, code: generateReferralCode(firstName), kind: "referral" },
      { partner_id: partnerId, code: generateReferralCode(lastName), kind: "discount" },
    ]),
    supabase.from("abw_partner_agreements").insert(
      REQUIRED_AGREEMENTS.filter((key) => LEGAL_DOCUMENTS.some((d) => d.key === key)).map(
        (key) => ({
          partner_id: partnerId,
          document_key: key,
          document_version: 1,
          ip_hash: ipHash,
          user_agent: request.headers.get("user-agent")?.slice(0, 400) ?? null,
        }),
      ),
    ),
    supabase.from("abw_audit_logs").insert({
      actor_user_id: userId,
      actor_email: email,
      action: "partner.registered",
      entity_type: "partner",
      entity_id: partnerId,
      after_state: { partner_code: partnerCode, sponsor_partner_id: sponsorPartnerId },
      reason: sponsorPartnerId ? `Sponsored via ${claim?.code}` : "Self-registered",
      ip_hash: ipHash,
    }),
  ]);
  // Note: `abw_referrals` records CUSTOMER attribution only. A partner signing
  // up under a sponsor is recorded in `abw_partner_relationships` above.

  const response = NextResponse.json({
    ok: true,
    partnerCode,
    message: "Your Partner application has been received.",
  });
  // The claim has been consumed.
  response.cookies.delete(REFERRAL_COOKIE);
  return response;
}
