export interface PartnerLevel {
  key: "partner" | "builder" | "pro_partner" | "elite" | "leader";
  name: string;
  requirement: string;
  description: string;
  minActiveCustomers: number;
  maxActiveCustomers: number | null;
  requiresLeaderQualification: boolean;
}

/**
 * Recognition tiers. Thresholds mirror `abw_partner_levels`; the database is
 * authoritative for dashboard badges, this file drives the public page and the
 * fallback when there is no database.
 */
export const PARTNER_LEVELS: PartnerLevel[] = [
  {
    key: "partner",
    name: "Partner",
    requirement: "1 - 4 active customers",
    description: "Working with your first customers and learning what each product fits.",
    minActiveCustomers: 1,
    maxActiveCustomers: 4,
    requiresLeaderQualification: false,
  },
  {
    key: "builder",
    name: "Builder",
    requirement: "5 - 9 active customers",
    description: "A working book of business, and a repeatable way of finding the next one.",
    minActiveCustomers: 5,
    maxActiveCustomers: 9,
    requiresLeaderQualification: false,
  },
  {
    key: "pro_partner",
    name: "Pro Partner",
    requirement: "10+ active customers",
    description: "An established customer base, usually across more than one product.",
    minActiveCustomers: 10,
    maxActiveCustomers: 24,
    requiresLeaderQualification: false,
  },
  {
    key: "elite",
    name: "Elite",
    requirement: "25+ active customers",
    description: "A substantial, retained customer base built over time.",
    minActiveCustomers: 25,
    maxActiveCustomers: null,
    requiresLeaderQualification: false,
  },
  {
    key: "leader",
    name: "Leader",
    requirement: "Meets the full Leadership qualification",
    description:
      "Customer results plus developed Partners, the required training, and good standing.",
    minActiveCustomers: 10,
    maxActiveCustomers: null,
    requiresLeaderQualification: true,
  },
];

export function levelForCustomerCount(count: number): PartnerLevel | null {
  if (count <= 0) return null;
  return (
    PARTNER_LEVELS.filter((l) => !l.requiresLeaderQualification)
      .filter((l) => count >= l.minActiveCustomers)
      .sort((a, b) => b.minActiveCustomers - a.minActiveCustomers)[0] ?? null
  );
}
