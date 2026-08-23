import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getCurrentPartner } from "@/lib/auth";

interface ProfilePayload {
  headline?: string;
  bio?: string;
  photoUrl?: string;
  location?: string;
  industries?: string;
  languages?: string;
  websiteUrl?: string;
  bookingUrl?: string;
  contactEmail?: string;
  linkedin?: string;
  facebook?: string;
  instagram?: string;
  productKeys?: string[];
  isPublic?: boolean;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** Only http(s) URLs are stored, so a profile can never carry a javascript: link. */
function url(value: unknown): string | null {
  const raw = text(value, 400);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function list(value: unknown, max = 12): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, max)
    .map((item) => item.slice(0, 60));
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, message: "This deployment is not connected to a database yet." },
      { status: 503 },
    );
  }

  const partner = await getCurrentPartner();
  if (!partner) {
    return NextResponse.json({ ok: false, message: "Sign in to continue." }, { status: 401 });
  }

  let payload: ProfilePayload;
  try {
    payload = (await request.json()) as ProfilePayload;
  } catch {
    return NextResponse.json(
      { ok: false, message: "We could not read that submission." },
      { status: 400 },
    );
  }

  // A pending or suspended partner may edit their profile but not publish it.
  const wantsPublic = Boolean(payload.isPublic);
  const isPublic = wantsPublic && partner.status === "active";

  const socialLinks: Record<string, string> = {};
  for (const key of ["linkedin", "facebook", "instagram"] as const) {
    const link = url(payload[key]);
    if (link) socialLinks[key] = link;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("abw_partner_profiles").upsert(
    {
      partner_id: partner.id,
      headline: text(payload.headline, 160),
      bio: text(payload.bio, 2000),
      photo_url: url(payload.photoUrl),
      location: text(payload.location, 120),
      industries: list(payload.industries),
      languages: list(payload.languages, 8),
      product_keys: Array.isArray(payload.productKeys)
        ? payload.productKeys.filter((k) => typeof k === "string").slice(0, 8)
        : [],
      website_url: url(payload.websiteUrl),
      booking_url: url(payload.bookingUrl),
      contact_email: text(payload.contactEmail, 200),
      social_links: socialLinks,
      is_public: isPublic,
      published_at: isPublic ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "partner_id" },
  );

  if (error) {
    return NextResponse.json(
      { ok: false, message: "We could not save your profile. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      wantsPublic && !isPublic
        ? "Profile saved. It will publish to the directory once your account is approved."
        : isPublic
          ? "Profile saved and published to the directory."
          : "Profile saved. It is not published to the directory.",
  });
}
