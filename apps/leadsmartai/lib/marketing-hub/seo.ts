/**
 * Structured data for a hub — a `RealEstateAgent` node built from fields the
 * agent actually filled in. A property that would be null is omitted rather
 * than emitted empty, and nothing is inferred: no ratings, no review counts,
 * no opening hours, because none of those are known to be true.
 *
 * Pure: takes plain values, returns a plain object for a JSON-LD script.
 */

export type HubSeoInput = {
  name: string;
  url: string;
  description: string | null;
  imageUrl: string | null;
  phone: string | null;
  email: string | null;
  brokerage: string | null;
  jobTitle: string | null;
  areas: string[];
  sameAs: string[];
  languages: string[];
};

export function realEstateAgentJsonLd(input: HubSeoInput): Record<string, unknown> {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: input.name,
    url: input.url,
  };
  if (input.description) node.description = input.description;
  if (input.imageUrl) node.image = input.imageUrl;
  if (input.phone) node.telephone = input.phone;
  if (input.email) node.email = input.email;
  if (input.jobTitle) node.jobTitle = input.jobTitle;
  if (input.brokerage) {
    node.memberOf = { "@type": "Organization", name: input.brokerage };
  }
  if (input.areas.length) {
    node.areaServed = input.areas.map((name) => ({ "@type": "Place", name }));
  }
  if (input.sameAs.length) node.sameAs = input.sameAs;
  if (input.languages.length) node.knowsLanguage = input.languages;
  return node;
}

/** Title tag: the agent's own SEO title, else "Name · Brokerage" or the name. */
export function hubTitle(args: {
  seoTitle: string | null;
  name: string;
  brandName: string | null;
  location: string | null;
}): string {
  const own = (args.seoTitle ?? "").trim();
  if (own) return own;
  const tail = args.brandName && args.brandName !== args.name ? args.brandName : args.location;
  return tail ? `${args.name} · ${tail}` : args.name;
}

/** Meta description: the agent's own, else the first 155 chars of the bio, else a name line. */
export function hubDescription(args: {
  seoDescription: string | null;
  bio: string | null;
  name: string;
  brandName: string | null;
  location: string | null;
}): string {
  const own = (args.seoDescription ?? "").trim();
  if (own) return own.slice(0, 320);
  const bio = (args.bio ?? "").replace(/\s+/g, " ").trim();
  if (bio) return bio.slice(0, 155);
  return [args.name, args.brandName, args.location].filter(Boolean).join(" · ");
}
