import type { Metadata } from "next";
import { isAdmin, requirePartner } from "@/lib/auth";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { PARTNER_NAV } from "@/lib/dashboard-nav";
import { SITE } from "@/lib/site";
import { DashboardShell } from "@/components/dashboard/shell";
import { ProfileForm, type ProfileValues } from "@/components/dashboard/profile-form";
import { Card } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Profile" };

const EMPTY: ProfileValues = {
  headline: "",
  bio: "",
  photoUrl: "",
  location: "",
  industries: "",
  languages: "",
  websiteUrl: "",
  bookingUrl: "",
  contactEmail: "",
  linkedin: "",
  facebook: "",
  instagram: "",
  productKeys: [],
  isPublic: false,
};

export default async function ProfilePage() {
  const partner = await requirePartner("/dashboard/profile");
  const admin = await isAdmin();

  let initial = { ...EMPTY, contactEmail: partner.email, productKeys: partner.productInterests };

  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("abw_partner_profiles")
        .select("*")
        .eq("partner_id", partner.id)
        .maybeSingle();

      if (data) {
        const social = (data.social_links ?? {}) as Record<string, string>;
        initial = {
          headline: data.headline ?? "",
          bio: data.bio ?? "",
          photoUrl: data.photo_url ?? "",
          location: data.location ?? "",
          industries: (data.industries ?? []).join(", "),
          languages: (data.languages ?? []).join(", "),
          websiteUrl: data.website_url ?? "",
          bookingUrl: data.booking_url ?? "",
          contactEmail: data.contact_email ?? partner.email,
          linkedin: social.linkedin ?? "",
          facebook: social.facebook ?? "",
          instagram: social.instagram ?? "",
          productKeys: data.product_keys ?? [],
          isPublic: Boolean(data.is_public),
        };
      }
    } catch {
      // Fall back to the empty form rather than failing the page.
    }
  }

  const profileUrl = `${SITE.url.replace(/\/$/, "")}/partners/${partner.slug}`;

  return (
    <DashboardShell
      nav={[...PARTNER_NAV]}
      isAdmin={admin}
      title="Profile"
      subtitle="Your account details, and the public profile businesses can find."
    >
      <div className="space-y-6">
        <Card>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">
            Account
          </h2>
          <dl className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Detail term="Name" detail={`${partner.firstName} ${partner.lastName}`} />
            <Detail term="Email" detail={partner.email} />
            <Detail term="Partner code" detail={partner.partnerCode} mono />
            <Detail term="Status" detail={partner.status} />
            <Detail term="Business" detail={partner.businessName ?? "—"} />
            <Detail term="Industry" detail={partner.industry ?? "—"} />
            <Detail
              term="Location"
              detail={[partner.stateProvince, partner.country].filter(Boolean).join(", ") || "—"}
            />
            <Detail term="Primary market" detail={partner.primaryMarket ?? "—"} />
          </dl>
          <p className="mt-6 text-xs text-muted">
            To change your name, email or sponsor, contact us - those fields are administrative and
            every change to them is recorded in the audit log.
          </p>
        </Card>

        <ProfileForm
          initial={initial}
          profileUrl={profileUrl}
          canPublish={partner.status === "active"}
        />

        <Disclaimer>
          Your public profile is subject to the Partner Marketing Guidelines. It must not contain
          income claims, earnings figures, guarantees, or any statement that implies you are an
          employee or agent of {SITE.name}.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}

function Detail({ term, detail, mono }: { term: string; detail: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-navy-500">
        {term}
      </dt>
      <dd className={mono ? "mt-1.5 font-mono text-[13px] text-ink" : "mt-1.5 text-sm text-ink"}>
        {detail}
      </dd>
    </div>
  );
}
