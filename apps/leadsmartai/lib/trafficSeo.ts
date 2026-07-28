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
  // ── Expansion: largest US metros. Figures are round, directional market
  // snapshots (same standard as the seed cities above); every page CTAs to a
  // real, current local report. For thousands-of-cities scale, drive these from
  // the Data Center warehouse (market_geographies) rather than hand figures.
  // California
  { slug: "san-jose-ca", city: "San Jose", state: "CA", marketZip: "95113", median_price: 1450000, price_per_sqft: 860, trend: "up" },
  { slug: "sacramento-ca", city: "Sacramento", state: "CA", marketZip: "95814", median_price: 500000, price_per_sqft: 330, trend: "stable" },
  { slug: "fresno-ca", city: "Fresno", state: "CA", marketZip: "93721", median_price: 400000, price_per_sqft: 250, trend: "stable" },
  { slug: "long-beach-ca", city: "Long Beach", state: "CA", marketZip: "90802", median_price: 720000, price_per_sqft: 560, trend: "stable" },
  { slug: "oakland-ca", city: "Oakland", state: "CA", marketZip: "94607", median_price: 800000, price_per_sqft: 600, trend: "stable" },
  { slug: "bakersfield-ca", city: "Bakersfield", state: "CA", marketZip: "93301", median_price: 375000, price_per_sqft: 210, trend: "up" },
  { slug: "anaheim-ca", city: "Anaheim", state: "CA", marketZip: "92805", median_price: 850000, price_per_sqft: 560, trend: "stable" },
  { slug: "riverside-ca", city: "Riverside", state: "CA", marketZip: "92501", median_price: 580000, price_per_sqft: 340, trend: "stable" },
  { slug: "santa-ana-ca", city: "Santa Ana", state: "CA", marketZip: "92701", median_price: 780000, price_per_sqft: 620, trend: "stable" },
  // New York
  { slug: "new-york-ny", city: "New York", state: "NY", marketZip: "10007", median_price: 750000, price_per_sqft: 850, trend: "stable" },
  { slug: "buffalo-ny", city: "Buffalo", state: "NY", marketZip: "14202", median_price: 250000, price_per_sqft: 175, trend: "up" },
  { slug: "rochester-ny", city: "Rochester", state: "NY", marketZip: "14604", median_price: 240000, price_per_sqft: 165, trend: "up" },
  { slug: "albany-ny", city: "Albany", state: "NY", marketZip: "12207", median_price: 300000, price_per_sqft: 200, trend: "stable" },
  // Texas
  { slug: "el-paso-tx", city: "El Paso", state: "TX", marketZip: "79901", median_price: 250000, price_per_sqft: 150, trend: "up" },
  { slug: "arlington-tx", city: "Arlington", state: "TX", marketZip: "76010", median_price: 350000, price_per_sqft: 190, trend: "up" },
  { slug: "corpus-christi-tx", city: "Corpus Christi", state: "TX", marketZip: "78401", median_price: 300000, price_per_sqft: 175, trend: "stable" },
  { slug: "plano-tx", city: "Plano", state: "TX", marketZip: "75074", median_price: 550000, price_per_sqft: 260, trend: "stable" },
  { slug: "lubbock-tx", city: "Lubbock", state: "TX", marketZip: "79401", median_price: 260000, price_per_sqft: 155, trend: "up" },
  // Florida
  { slug: "fort-lauderdale-fl", city: "Fort Lauderdale", state: "FL", marketZip: "33301", median_price: 550000, price_per_sqft: 370, trend: "up" },
  { slug: "st-petersburg-fl", city: "St. Petersburg", state: "FL", marketZip: "33701", median_price: 430000, price_per_sqft: 300, trend: "stable" },
  { slug: "cape-coral-fl", city: "Cape Coral", state: "FL", marketZip: "33904", median_price: 400000, price_per_sqft: 250, trend: "down" },
  { slug: "tallahassee-fl", city: "Tallahassee", state: "FL", marketZip: "32301", median_price: 300000, price_per_sqft: 185, trend: "stable" },
  { slug: "sarasota-fl", city: "Sarasota", state: "FL", marketZip: "34236", median_price: 520000, price_per_sqft: 340, trend: "stable" },
  { slug: "fort-myers-fl", city: "Fort Myers", state: "FL", marketZip: "33901", median_price: 400000, price_per_sqft: 250, trend: "down" },
  // Washington
  { slug: "spokane-wa", city: "Spokane", state: "WA", marketZip: "99201", median_price: 420000, price_per_sqft: 260, trend: "stable" },
  { slug: "tacoma-wa", city: "Tacoma", state: "WA", marketZip: "98402", median_price: 500000, price_per_sqft: 320, trend: "stable" },
  { slug: "bellevue-wa", city: "Bellevue", state: "WA", marketZip: "98004", median_price: 1200000, price_per_sqft: 700, trend: "up" },
  // Oregon
  { slug: "portland-or", city: "Portland", state: "OR", marketZip: "97204", median_price: 540000, price_per_sqft: 350, trend: "stable" },
  { slug: "salem-or", city: "Salem", state: "OR", marketZip: "97301", median_price: 450000, price_per_sqft: 280, trend: "stable" },
  // Arizona
  { slug: "tucson-az", city: "Tucson", state: "AZ", marketZip: "85701", median_price: 370000, price_per_sqft: 240, trend: "stable" },
  { slug: "mesa-az", city: "Mesa", state: "AZ", marketZip: "85201", median_price: 480000, price_per_sqft: 280, trend: "stable" },
  { slug: "scottsdale-az", city: "Scottsdale", state: "AZ", marketZip: "85251", median_price: 850000, price_per_sqft: 450, trend: "up" },
  { slug: "chandler-az", city: "Chandler", state: "AZ", marketZip: "85225", median_price: 550000, price_per_sqft: 300, trend: "stable" },
  // Nevada
  { slug: "reno-nv", city: "Reno", state: "NV", marketZip: "89501", median_price: 550000, price_per_sqft: 340, trend: "stable" },
  { slug: "henderson-nv", city: "Henderson", state: "NV", marketZip: "89002", median_price: 500000, price_per_sqft: 290, trend: "stable" },
  // Colorado
  { slug: "colorado-springs-co", city: "Colorado Springs", state: "CO", marketZip: "80903", median_price: 480000, price_per_sqft: 300, trend: "stable" },
  { slug: "aurora-co", city: "Aurora", state: "CO", marketZip: "80012", median_price: 500000, price_per_sqft: 290, trend: "stable" },
  { slug: "fort-collins-co", city: "Fort Collins", state: "CO", marketZip: "80521", median_price: 560000, price_per_sqft: 330, trend: "stable" },
  // Utah
  { slug: "salt-lake-city-ut", city: "Salt Lake City", state: "UT", marketZip: "84101", median_price: 560000, price_per_sqft: 340, trend: "stable" },
  { slug: "provo-ut", city: "Provo", state: "UT", marketZip: "84601", median_price: 520000, price_per_sqft: 290, trend: "stable" },
  // Massachusetts
  { slug: "boston-ma", city: "Boston", state: "MA", marketZip: "02108", median_price: 780000, price_per_sqft: 730, trend: "up" },
  { slug: "worcester-ma", city: "Worcester", state: "MA", marketZip: "01608", median_price: 420000, price_per_sqft: 300, trend: "up" },
  { slug: "springfield-ma", city: "Springfield", state: "MA", marketZip: "01103", median_price: 300000, price_per_sqft: 230, trend: "up" },
  // Illinois
  { slug: "naperville-il", city: "Naperville", state: "IL", marketZip: "60540", median_price: 480000, price_per_sqft: 240, trend: "stable" },
  // Ohio
  { slug: "columbus-oh", city: "Columbus", state: "OH", marketZip: "43215", median_price: 300000, price_per_sqft: 200, trend: "up" },
  { slug: "cleveland-oh", city: "Cleveland", state: "OH", marketZip: "44113", median_price: 220000, price_per_sqft: 150, trend: "stable" },
  { slug: "cincinnati-oh", city: "Cincinnati", state: "OH", marketZip: "45202", median_price: 280000, price_per_sqft: 190, trend: "up" },
  { slug: "toledo-oh", city: "Toledo", state: "OH", marketZip: "43604", median_price: 170000, price_per_sqft: 120, trend: "stable" },
  // Michigan
  { slug: "detroit-mi", city: "Detroit", state: "MI", marketZip: "48226", median_price: 190000, price_per_sqft: 150, trend: "up" },
  { slug: "grand-rapids-mi", city: "Grand Rapids", state: "MI", marketZip: "49503", median_price: 320000, price_per_sqft: 220, trend: "up" },
  { slug: "ann-arbor-mi", city: "Ann Arbor", state: "MI", marketZip: "48104", median_price: 480000, price_per_sqft: 320, trend: "stable" },
  // Pennsylvania
  { slug: "philadelphia-pa", city: "Philadelphia", state: "PA", marketZip: "19107", median_price: 300000, price_per_sqft: 240, trend: "stable" },
  { slug: "pittsburgh-pa", city: "Pittsburgh", state: "PA", marketZip: "15222", median_price: 240000, price_per_sqft: 165, trend: "stable" },
  { slug: "allentown-pa", city: "Allentown", state: "PA", marketZip: "18101", median_price: 300000, price_per_sqft: 210, trend: "up" },
  // North Carolina
  { slug: "raleigh-nc", city: "Raleigh", state: "NC", marketZip: "27601", median_price: 440000, price_per_sqft: 260, trend: "up" },
  { slug: "durham-nc", city: "Durham", state: "NC", marketZip: "27701", median_price: 410000, price_per_sqft: 250, trend: "up" },
  { slug: "greensboro-nc", city: "Greensboro", state: "NC", marketZip: "27401", median_price: 280000, price_per_sqft: 165, trend: "up" },
  { slug: "winston-salem-nc", city: "Winston-Salem", state: "NC", marketZip: "27101", median_price: 270000, price_per_sqft: 160, trend: "up" },
  // South Carolina
  { slug: "charleston-sc", city: "Charleston", state: "SC", marketZip: "29401", median_price: 620000, price_per_sqft: 400, trend: "up" },
  { slug: "columbia-sc", city: "Columbia", state: "SC", marketZip: "29201", median_price: 260000, price_per_sqft: 160, trend: "up" },
  { slug: "greenville-sc", city: "Greenville", state: "SC", marketZip: "29601", median_price: 340000, price_per_sqft: 210, trend: "up" },
  // Georgia
  { slug: "savannah-ga", city: "Savannah", state: "GA", marketZip: "31401", median_price: 340000, price_per_sqft: 210, trend: "up" },
  { slug: "augusta-ga", city: "Augusta", state: "GA", marketZip: "30901", median_price: 250000, price_per_sqft: 150, trend: "stable" },
  // Tennessee
  { slug: "memphis-tn", city: "Memphis", state: "TN", marketZip: "38103", median_price: 260000, price_per_sqft: 160, trend: "stable" },
  { slug: "knoxville-tn", city: "Knoxville", state: "TN", marketZip: "37902", median_price: 360000, price_per_sqft: 220, trend: "up" },
  { slug: "chattanooga-tn", city: "Chattanooga", state: "TN", marketZip: "37402", median_price: 340000, price_per_sqft: 200, trend: "up" },
  // Virginia
  { slug: "virginia-beach-va", city: "Virginia Beach", state: "VA", marketZip: "23451", median_price: 380000, price_per_sqft: 260, trend: "stable" },
  { slug: "richmond-va", city: "Richmond", state: "VA", marketZip: "23219", median_price: 350000, price_per_sqft: 250, trend: "up" },
  { slug: "norfolk-va", city: "Norfolk", state: "VA", marketZip: "23510", median_price: 320000, price_per_sqft: 220, trend: "stable" },
  // DC / Maryland
  { slug: "washington-dc", city: "Washington", state: "DC", marketZip: "20001", median_price: 650000, price_per_sqft: 560, trend: "stable" },
  { slug: "baltimore-md", city: "Baltimore", state: "MD", marketZip: "21202", median_price: 220000, price_per_sqft: 200, trend: "stable" },
  // Minnesota
  { slug: "minneapolis-mn", city: "Minneapolis", state: "MN", marketZip: "55401", median_price: 350000, price_per_sqft: 260, trend: "stable" },
  { slug: "st-paul-mn", city: "St. Paul", state: "MN", marketZip: "55102", median_price: 300000, price_per_sqft: 230, trend: "stable" },
  // Wisconsin
  { slug: "milwaukee-wi", city: "Milwaukee", state: "WI", marketZip: "53202", median_price: 230000, price_per_sqft: 175, trend: "stable" },
  { slug: "madison-wi", city: "Madison", state: "WI", marketZip: "53703", median_price: 400000, price_per_sqft: 260, trend: "up" },
  // Missouri
  { slug: "kansas-city-mo", city: "Kansas City", state: "MO", marketZip: "64106", median_price: 280000, price_per_sqft: 190, trend: "up" },
  { slug: "st-louis-mo", city: "St. Louis", state: "MO", marketZip: "63101", median_price: 230000, price_per_sqft: 165, trend: "stable" },
  // Indiana / Kentucky
  { slug: "indianapolis-in", city: "Indianapolis", state: "IN", marketZip: "46204", median_price: 260000, price_per_sqft: 165, trend: "up" },
  { slug: "louisville-ky", city: "Louisville", state: "KY", marketZip: "40202", median_price: 275000, price_per_sqft: 175, trend: "stable" },
  // Louisiana
  { slug: "new-orleans-la", city: "New Orleans", state: "LA", marketZip: "70112", median_price: 330000, price_per_sqft: 230, trend: "down" },
  { slug: "baton-rouge-la", city: "Baton Rouge", state: "LA", marketZip: "70801", median_price: 250000, price_per_sqft: 155, trend: "stable" },
  // Oklahoma
  { slug: "oklahoma-city-ok", city: "Oklahoma City", state: "OK", marketZip: "73102", median_price: 260000, price_per_sqft: 160, trend: "up" },
  { slug: "tulsa-ok", city: "Tulsa", state: "OK", marketZip: "74103", median_price: 240000, price_per_sqft: 150, trend: "up" },
  // Plains / Mountain
  { slug: "wichita-ks", city: "Wichita", state: "KS", marketZip: "67202", median_price: 230000, price_per_sqft: 145, trend: "up" },
  { slug: "omaha-ne", city: "Omaha", state: "NE", marketZip: "68102", median_price: 280000, price_per_sqft: 185, trend: "up" },
  { slug: "des-moines-ia", city: "Des Moines", state: "IA", marketZip: "50309", median_price: 250000, price_per_sqft: 170, trend: "stable" },
  { slug: "little-rock-ar", city: "Little Rock", state: "AR", marketZip: "72201", median_price: 240000, price_per_sqft: 155, trend: "stable" },
  { slug: "albuquerque-nm", city: "Albuquerque", state: "NM", marketZip: "87102", median_price: 350000, price_per_sqft: 220, trend: "stable" },
  { slug: "boise-id", city: "Boise", state: "ID", marketZip: "83702", median_price: 500000, price_per_sqft: 320, trend: "stable" },
  // Alabama
  { slug: "birmingham-al", city: "Birmingham", state: "AL", marketZip: "35203", median_price: 250000, price_per_sqft: 155, trend: "stable" },
  { slug: "huntsville-al", city: "Huntsville", state: "AL", marketZip: "35801", median_price: 340000, price_per_sqft: 195, trend: "up" },
  // Northeast + Hawaii
  { slug: "honolulu-hi", city: "Honolulu", state: "HI", marketZip: "96813", median_price: 850000, price_per_sqft: 700, trend: "stable" },
  { slug: "providence-ri", city: "Providence", state: "RI", marketZip: "02903", median_price: 450000, price_per_sqft: 340, trend: "up" },
  { slug: "hartford-ct", city: "Hartford", state: "CT", marketZip: "06103", median_price: 300000, price_per_sqft: 220, trend: "up" },
  { slug: "new-haven-ct", city: "New Haven", state: "CT", marketZip: "06510", median_price: 350000, price_per_sqft: 250, trend: "up" },
  { slug: "newark-nj", city: "Newark", state: "NJ", marketZip: "07102", median_price: 450000, price_per_sqft: 330, trend: "up" },
  { slug: "jersey-city-nj", city: "Jersey City", state: "NJ", marketZip: "07302", median_price: 700000, price_per_sqft: 560, trend: "stable" },
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

export function getLongTailKeywordSet(pageType: PageType, citySlug: string) {
  const city = getCityBySlug(citySlug);
  if (!city) return [];
  const baseKeywords = KEYWORD_VARIATIONS[pageType] ?? [];
  const cityText = `${city.city} ${city.state}`;
  const set = new Set<string>();

  for (const base of baseKeywords) {
    set.add(`${base} ${cityText}`);
    set.add(`${base} in ${city.city}`);
    for (const year of YEAR_MODIFIERS) set.add(`${base} ${cityText} ${year}`);
    for (const local of LOCAL_SEO_TERMS) set.add(`${base} ${cityText} ${local}`);
  }

  return Array.from(set);
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

