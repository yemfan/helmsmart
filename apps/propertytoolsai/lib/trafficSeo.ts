export type Trend = "up" | "down" | "stable";
export type PageType = "home-value" | "sell-house" | "market-report";

export type CityConfig = {
  slug: string;
  city: string;
  state: string;
  /** Representative ZIP for RentCast GET /v1/markets (required by API). */
  marketZip: string;
  median_price: number;
  price_per_sqft: number;
  trend: Trend;
};

export const TRAFFIC_CITIES: CityConfig[] = [
  { slug: "los-angeles-ca", city: "Los Angeles", state: "CA", marketZip: "90012", median_price: 955000, price_per_sqft: 650, trend: "up" },
  { slug: "san-diego-ca", city: "San Diego", state: "CA", marketZip: "92101", median_price: 910000, price_per_sqft: 610, trend: "up" },
  { slug: "san-francisco-ca", city: "San Francisco", state: "CA", marketZip: "94102", median_price: 1325000, price_per_sqft: 910, trend: "stable" },
  { slug: "austin-tx", city: "Austin", state: "TX", marketZip: "78701", median_price: 575000, price_per_sqft: 320, trend: "stable" },
  { slug: "houston-tx", city: "Houston", state: "TX", marketZip: "77002", median_price: 385000, price_per_sqft: 210, trend: "up" },
  { slug: "dallas-tx", city: "Dallas", state: "TX", marketZip: "75201", median_price: 455000, price_per_sqft: 245, trend: "up" },
  { slug: "phoenix-az", city: "Phoenix", state: "AZ", marketZip: "85003", median_price: 485000, price_per_sqft: 285, trend: "stable" },
  { slug: "miami-fl", city: "Miami", state: "FL", marketZip: "33131", median_price: 640000, price_per_sqft: 430, trend: "up" },
  { slug: "orlando-fl", city: "Orlando", state: "FL", marketZip: "32801", median_price: 420000, price_per_sqft: 250, trend: "stable" },
  { slug: "seattle-wa", city: "Seattle", state: "WA", marketZip: "98101", median_price: 830000, price_per_sqft: 520, trend: "up" },
  { slug: "denver-co", city: "Denver", state: "CO", marketZip: "80202", median_price: 615000, price_per_sqft: 360, trend: "stable" },
  { slug: "atlanta-ga", city: "Atlanta", state: "GA", marketZip: "30303", median_price: 445000, price_per_sqft: 235, trend: "up" },
  { slug: "charlotte-nc", city: "Charlotte", state: "NC", marketZip: "28202", median_price: 410000, price_per_sqft: 220, trend: "up" },
  { slug: "nashville-tn", city: "Nashville", state: "TN", marketZip: "37203", median_price: 520000, price_per_sqft: 280, trend: "up" },
  { slug: "chicago-il", city: "Chicago", state: "IL", marketZip: "60602", median_price: 395000, price_per_sqft: 255, trend: "stable" },
  { slug: "tampa-fl", city: "Tampa", state: "FL", marketZip: "33602", median_price: 445000, price_per_sqft: 260, trend: "up" },
  { slug: "jacksonville-fl", city: "Jacksonville", state: "FL", marketZip: "32202", median_price: 370000, price_per_sqft: 210, trend: "stable" },
  { slug: "fort-worth-tx", city: "Fort Worth", state: "TX", marketZip: "76102", median_price: 395000, price_per_sqft: 215, trend: "up" },
  { slug: "san-antonio-tx", city: "San Antonio", state: "TX", marketZip: "78205", median_price: 355000, price_per_sqft: 195, trend: "stable" },
  { slug: "las-vegas-nv", city: "Las Vegas", state: "NV", marketZip: "89101", median_price: 460000, price_per_sqft: 275, trend: "up" },
];

export const KEYWORD_VARIATIONS: Record<PageType, string[]> = {
  "home-value": [
    "home value estimate",
    "what is my home worth",
    "home valuation",
    "property value report",
    "house worth today",
  ],
  "sell-house": [
    "sell my house fast",
    "best time to sell",
    "how to sell house",
    "seller strategy",
    "home selling plan",
  ],
  "market-report": [
    "housing market report",
    "real estate market trends",
    "city market forecast",
    "monthly market update",
    "inventory and pricing report",
  ],
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MODIFIERS = [CURRENT_YEAR, CURRENT_YEAR - 1];
const LOCAL_SEO_TERMS = [
  "near me",
  "local experts",
  "by zip code",
  "in my neighborhood",
];

export function getCityBySlug(slug: string): CityConfig | null {
  return TRAFFIC_CITIES.find((c) => c.slug === slug) ?? null;
}

export function getMarketSnapshot(slug: string) {
  const city = getCityBySlug(slug);
  if (!city) {
    return {
      avgHomeValue: 0,
      yoyChangePct: 0,
      medianDaysOnMarket: 0,
      sellerDemandScore: 0,
      pricePerSqft: 0,
      trend: "stable" as Trend,
    };
  }
  const trendDelta = city.trend === "up" ? 4.2 : city.trend === "down" ? -2.7 : 0.8;
  const medianDaysOnMarket =
    city.trend === "up" ? 24 : city.trend === "down" ? 52 : 36;
  const sellerDemandScore =
    city.trend === "up" ? 82 : city.trend === "down" ? 48 : 64;
  return {
    avgHomeValue: city.median_price,
    yoyChangePct: trendDelta,
    medianDaysOnMarket,
    sellerDemandScore,
    pricePerSqft: city.price_per_sqft,
    trend: city.trend,
  };
}

export function getNearbyCities(slug: string, limit = 4): CityConfig[] {
  const base = getCityBySlug(slug);
  if (!base) return [];
  return TRAFFIC_CITIES.filter((c) => c.slug !== slug && c.state === base.state)
    .sort((a, b) => Math.abs(a.median_price - base.median_price) - Math.abs(b.median_price - base.median_price))
    .slice(0, limit);
}

export function getPageKeywords(pageType: PageType, slug: string, limit = 3) {
  const list = KEYWORD_VARIATIONS[pageType] ?? [];
  let h = 0;
  const seed = `${pageType}|${slug}`;
  for (let i = 0; i < seed.length; i += 1) h = (h * 33 + seed.charCodeAt(i)) >>> 0;
  const start = list.length ? h % list.length : 0;
  const out: string[] = [];
  for (let i = 0; i < Math.min(limit, list.length); i += 1) {
    out.push(list[(start + i) % list.length]);
  }
  return out;
}

export function keywordToSlug(keyword: string) {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function slugToKeyword(slug: string) {
  return slug.replace(/-/g, " ").trim();
}

/**
 * Pure long-tail keyword builder, parameterized by city + state so it works for
 * warehouse-driven metros/counties/ZIPs (see lib/trafficMetros) as well as seeds.
 */
export function buildLongTailKeywordSet(
  pageType: PageType,
  cityName: string,
  stateCode: string,
) {
  const baseKeywords = KEYWORD_VARIATIONS[pageType] ?? [];
  const cityText = `${cityName} ${stateCode}`;
  const set = new Set<string>();

  for (const base of baseKeywords) {
    set.add(`${base} ${cityText}`);
    set.add(`${base} in ${cityName}`);
    for (const year of YEAR_MODIFIERS) set.add(`${base} ${cityText} ${year}`);
    for (const local of LOCAL_SEO_TERMS) set.add(`${base} ${cityText} ${local}`);
  }

  return Array.from(set);
}

export function getLongTailKeywordSet(pageType: PageType, citySlug: string) {
  const city = getCityBySlug(citySlug);
  if (!city) return [];
  return buildLongTailKeywordSet(pageType, city.city, city.state);
}

export function getKeywordPagesForCity(pageType: PageType, citySlug: string, limit = 20) {
  const keywords = getLongTailKeywordSet(pageType, citySlug).slice(0, limit);
  return keywords.map((keyword) => ({ keyword, keywordSlug: keywordToSlug(keyword) }));
}

export function isValidKeywordSlugForCity(pageType: PageType, citySlug: string, keywordSlug: string) {
  return getKeywordPagesForCity(pageType, citySlug).some((k) => k.keywordSlug === keywordSlug);
}

export function getRelatedPageLinks(slug: string) {
  return [
    { href: `/home-value/${slug}`, label: "Home Value Page" },
    { href: `/sell-house/${slug}`, label: "Sell House Guide" },
    { href: `/market-report/${slug}`, label: "Market Report" },
    { href: `/blog`, label: "Real Estate Insights" },
    { href: `/`, label: "Property Tools" },
  ];
}

export function formatCurrency(n: number) {
  return `$${Math.round(n).toLocaleString()}`;
}

export function estimateProgrammaticPageCount(cityCount = TRAFFIC_CITIES.length, keywordCount = 5) {
  // 3 page types * city count * keyword intent variants in on-page SEO blocks.
  return cityCount * 3 * keywordCount;
}

export function estimateKeywordRouteCount(cityCount = TRAFFIC_CITIES.length, keywordCount = 20) {
  // Distinct keyword URL pages for each city and core route family.
  return cityCount * 3 * keywordCount;
}

