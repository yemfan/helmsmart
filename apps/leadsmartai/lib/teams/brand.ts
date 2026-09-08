import { z } from "zod";

/**
 * The brokerage brand a team owner sets once and every member hub carries:
 * name and logo in the header, license, website and disclosure in the
 * footer. Pure: the shape, its normalisation, and nothing else.
 */

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "http(s) URL")
  .transform((v) => v || null);

export const TeamBrandSchema = z.object({
  name: z.string().trim().max(120).transform((v) => v || null),
  logoUrl: httpUrl,
  website: httpUrl,
  license: z.string().trim().max(80).transform((v) => v || null),
  /** Text the brokerage requires on every agent page (an equal-housing line, an entity disclosure). */
  disclosure: z.string().trim().max(1000).transform((v) => v || null),
});

export type TeamBrand = z.infer<typeof TeamBrandSchema>;

export function emptyBrand(): TeamBrand {
  return { name: null, logoUrl: null, website: null, license: null, disclosure: null };
}

/** Whatever is stored → a valid brand, or null when nothing in it would show. */
export function normalizeBrand(raw: unknown): TeamBrand | null {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  // A stored URL that is not http(s) is dropped on its own; the rest of the brand stays.
  const url = (v: unknown) => (/^https?:\/\/\S+$/i.test(str(v).trim()) ? str(v).trim() : "");
  const parsed = TeamBrandSchema.safeParse({
    name: str(src.name),
    logoUrl: url(src.logoUrl),
    website: url(src.website),
    license: str(src.license),
    disclosure: str(src.disclosure),
  });
  const b = parsed.success ? parsed.data : emptyBrand();
  return b.name || b.logoUrl || b.website || b.license || b.disclosure ? b : null;
}

/** Form input → a brand, or the field-level problems. */
export function parseBrandInput(input: Record<string, unknown>): { ok: true; brand: TeamBrand | null } | { ok: false; field: keyof TeamBrand } {
  const parsed = TeamBrandSchema.safeParse({
    name: str(input.name),
    logoUrl: str(input.logoUrl),
    website: str(input.website),
    license: str(input.license),
    disclosure: str(input.disclosure),
  });
  if (!parsed.success) {
    const field = (parsed.error.issues[0]?.path[0] as keyof TeamBrand | undefined) ?? "name";
    return { ok: false, field };
  }
  return { ok: true, brand: normalizeBrand(parsed.data) };
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
