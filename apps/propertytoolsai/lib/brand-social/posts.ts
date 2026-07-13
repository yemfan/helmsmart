/**
 * PropertyTools AI brand marketing posts — the content the auto-poster
 * publishes to LinkedIn on a schedule, in order. Single source of truth.
 *
 * IMPORTANT: PropertyTools AI shares the `brand_social_log` table with
 * RealtyBoss (same Supabase project), and that table's uniqueness is
 * `(platform, post_key)` with no app discriminator. All keys here are
 * prefixed `ptai-` so they can never collide with RealtyBoss's post keys.
 *
 * `caption` is the post body (plain text). `hashtags` are inlined by the
 * publisher (LinkedIn renders them clickable).
 */
export type BrandPost = {
  key: string; // stable, unique, ptai-prefixed — used in brand_social_log
  caption: string;
  hashtags: string[];
};

export const BRAND_POSTS: BrandPost[] = [
  {
    key: "ptai-free-tools",
    caption:
      "We built a free toolkit every real estate investor and agent should bookmark. 🧰\n\nCap-rate, mortgage, rent-vs-buy, home-value, net-sheet — run the numbers in seconds, no signup.\n\npropertytoolsai.com",
    hashtags: ["RealEstate", "RealEstateInvesting", "PropTech"],
  },
  {
    key: "ptai-deal-analyzer",
    caption:
      "Is it actually a good deal — or does it just look like one?\n\nOur AI Deal Analyzer breaks down cash flow, cap rate, cash-on-cash, and the risks on any property, in plain English. Stop guessing on offers.\n\npropertytoolsai.com",
    hashtags: ["RealEstateInvesting", "PropTech", "AI"],
  },
  {
    key: "ptai-cap-rate",
    caption:
      "Cap rate is the number that separates a deal from a dud.\n\nOur free cap-rate calculator does it instantly — NOI, expenses, and the rate — so you can compare properties apples-to-apples before you write an offer.\n\npropertytoolsai.com",
    hashtags: ["RealEstateInvesting", "CapRate", "RealEstate"],
  },
  {
    key: "ptai-rent-vs-buy",
    caption:
      "\"Should I rent or buy?\" — the question every client asks.\n\nGive them a real answer: our rent-vs-buy calculator models the true cost of both over time, not a gut feeling. A great conversation-starter for buyer consults.\n\npropertytoolsai.com",
    hashtags: ["RealEstate", "Homebuying", "Realtor"],
  },
  {
    key: "ptai-cma",
    caption:
      "Pricing a listing shouldn't take an afternoon.\n\nOur AI-grounded CMA pulls real comparable sales and gives you a defensible value range — the expertise your seller expects, in minutes.\n\npropertytoolsai.com",
    hashtags: ["RealEstate", "Realtor", "CMA"],
  },
  {
    key: "ptai-home-value",
    caption:
      "What's the home actually worth?\n\nOur free home-value tool gives buyers and sellers a fast, data-backed estimate — a low-friction lead magnet you can share anywhere.\n\npropertytoolsai.com",
    hashtags: ["RealEstate", "HomeValue", "PropTech"],
  },
  {
    key: "ptai-net-sheet",
    caption:
      "The #1 seller question: \"What do I actually walk away with?\"\n\nBuild a clean seller net sheet in seconds — gross to net, reconciled to the dollar. Trust, built on transparency.\n\npropertytoolsai.com",
    hashtags: ["RealEstate", "HomeSelling", "Realtor"],
  },
  {
    key: "ptai-guides",
    caption:
      "New to investing in real estate? We wrote the guides we wish we'd had.\n\nCap rate, cash-on-cash, the BRRRR method, rent-vs-buy — plain-English explainers paired with the calculators to run your own numbers.\n\npropertytoolsai.com",
    hashtags: ["RealEstateInvesting", "RealEstate", "Investing"],
  },
];
