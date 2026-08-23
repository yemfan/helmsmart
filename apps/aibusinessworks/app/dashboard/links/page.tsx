import type { Metadata } from "next";
import { isAdmin, requirePartner } from "@/lib/auth";
import { getPartnerDashboard } from "@/lib/partners";
import { loadPublicRules } from "@/lib/compensation/repository";
import { formatBps, formatMonthsAsYears } from "@/lib/compensation/format";
import { qrCodeUrl, referralUrl } from "@/lib/referrals";
import { PARTNER_NAV } from "@/lib/dashboard-nav";
import { PRODUCTS } from "@/content/products";
import { SITE } from "@/lib/site";
import { DashboardShell } from "@/components/dashboard/shell";
import { CopyField } from "@/components/dashboard/copy-field";
import { EmptyState } from "@/components/dashboard/pieces";
import { Card } from "@/components/ui/primitives";
import { Disclaimer } from "@/components/ui/disclaimer";

export const metadata: Metadata = { title: "Links & Codes" };

export default async function LinksPage() {
  const partner = await requirePartner("/dashboard/links");
  const [data, { rules }, admin] = await Promise.all([
    getPartnerDashboard(partner.id),
    loadPublicRules(),
    isAdmin(),
  ]);

  const referral = data.referralCodes.find((c) => c.kind === "referral");
  const discount = data.referralCodes.find((c) => c.kind === "discount");
  const link = referral ? referralUrl(referral.code) : null;
  const profileUrl = `${SITE.url.replace(/\/$/, "")}/partners/${partner.slug}`;

  return (
    <DashboardShell
      nav={[...PARTNER_NAV]}
      isAdmin={admin}
      title="Links and codes"
      subtitle="Your referral link, your discount code, your QR code and your public Partner page."
    >
      <div className="space-y-6">
        {partner.status !== "active" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
            Your codes are issued but attribution only counts once your account is approved. Hold
            off on sharing them until then.
          </div>
        ) : null}

        {referral && link ? (
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="space-y-6">
              <Card>
                <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                  Your referral link
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Every visit through this link is recorded against you, and the attribution is
                  held for 90 days.
                </p>
                <div className="mt-5 space-y-5">
                  <CopyField label="Referral link" value={link} />
                  {discount ? (
                    <CopyField
                      label="Discount code"
                      value={discount.code}
                      hint={
                        discount.discountBps
                          ? `Currently ${formatBps(discount.discountBps)} off for the customer.`
                          : `Currently ${formatBps(rules.customerDiscount.defaultDiscountBps)} off for the customer, for ${formatMonthsAsYears(rules.customerDiscount.discountDurationMonths)}.`
                      }
                    />
                  ) : null}
                  <CopyField
                    label="Public Partner page"
                    value={profileUrl}
                    hint="Publish your profile first, on the Profile tab."
                  />
                </div>
              </Card>

              <Card>
                <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                  Product-specific links
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Same attribution, but the visitor lands on the product you are talking about.
                </p>
                <div className="mt-5 space-y-5">
                  {PRODUCTS.map((product) => (
                    <CopyField
                      key={product.key}
                      label={product.name}
                      value={referralUrl(referral.code, `/solutions#${product.key}`)}
                    />
                  ))}
                </div>
              </Card>
            </div>

            <Card>
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">
                QR code
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                For print, events and in-person conversations. It points at your referral link.
              </p>
              <div className="mt-5 rounded-2xl border border-hairline bg-white p-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeUrl(link)}
                  alt={`QR code for referral link ${referral.code}`}
                  width={512}
                  height={512}
                  className="h-auto w-full"
                />
              </div>
              <a
                href={qrCodeUrl(link, 1024)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex text-sm font-medium text-navy-700 underline underline-offset-4"
              >
                Open full size
              </a>
            </Card>
          </div>
        ) : (
          <EmptyState
            title="Your codes are not ready yet"
            body="Referral and discount codes are issued when your Partner account is created. If this persists, contact us and we will issue them."
          />
        )}

        <Disclaimer>
          Customer discount amounts and durations are set by AI Business Works and can change. The
          discount actually applied at checkout is the one in effect at that moment, and commission
          is calculated on what the customer is actually billed.
        </Disclaimer>
      </div>
    </DashboardShell>
  );
}
