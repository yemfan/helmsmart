/**
 * MarketingBoss AI — credit packs (one-time purchases, pay-as-you-go).
 *
 * Credits are spent by the generator: image = 1, edit = 2, video = 20. Packs get
 * cheaper per credit as they get bigger. Prices are in whole USD cents. Packs are
 * defined here (not as Stripe Products) so Checkout builds them inline with
 * price_data — nothing to pre-create in the Stripe dashboard.
 */

export type CreditPack = {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  blurb: string;
  popular?: boolean;
};

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: "starter",
    name: "Starter",
    credits: 100,
    priceCents: 900,
    blurb: "~100 images or 5 videos. Great for testing the waters.",
  },
  {
    id: "creator",
    name: "Creator",
    credits: 500,
    priceCents: 3900,
    blurb: "~500 images or 25 videos. Best value for regular posting.",
    popular: true,
  },
  {
    id: "studio",
    name: "Studio",
    credits: 1500,
    priceCents: 9900,
    blurb: "~1,500 images or 75 videos. For heavy campaigns & lots of video.",
  },
];

export function getPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

/** "$9", "$39" — packs are priced in whole dollars, so no cents shown. */
export function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
