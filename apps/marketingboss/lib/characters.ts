import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { anthropicJson } from "@/lib/ai";

/**
 * Character Studio — a persistent cast per business.
 * See docs/marketing/character-studio.md.
 *
 * Consistency design (honest): a STABLE prompt_profile derived from DNA +
 * a canonical portrait in reference_images[0] fed to fal's edit/i2v models.
 * We never promise identical output — we promise "recognizably the same
 * character". All reads/writes tolerate a pre-0023 DB.
 */

export type CharacterType = "human" | "animal" | "robot" | "creature" | "mascot";

export type CharacterDna = {
  /** e.g. age, skinTone, hair, eyes, build, distinguishing features / species, breed / body style, materials */
  appearance: Record<string, string>;
  /** clothing, accessories, visualStyle, colors */
  style: Record<string, string>;
  /** traits, energy, humor, communicationStyle */
  personality: Record<string, string>;
  /** description-only in MVP: genderPresentation, ageStyle, accent, tone, speed */
  voice: Record<string, string>;
  /** profession, industry, expertise, location */
  professional: Record<string, string>;
};

export type Character = {
  id: string;
  parent_id: string | null;
  version: number;
  name: string;
  type: CharacterType;
  role: string | null;
  collection: string | null;
  dna: CharacterDna;
  prompt_profile: string | null;
  reference_images: string[] | null;
  brand_linked: boolean;
  identity_type: "fictional" | "real_person" | "brand_owned";
  consent_note: string | null;
  status: "active" | "archived";
  usage_count: number;
  created_at: string;
};

function tableMissing(msg: string | undefined): boolean {
  const m = msg ?? "";
  return m.includes("characters") && (m.includes("does not exist") || m.includes("schema cache"));
}

/** Deterministic descriptor reused VERBATIM in every generation — the consistency text. */
export function buildPromptProfile(name: string, type: CharacterType, role: string | null, dna: CharacterDna): string {
  const section = (r: Record<string, string>) =>
    Object.values(r)
      .filter((v) => v && v.trim())
      .join(", ");
  const parts = [
    `${name}${role ? `, a ${role}` : ""} (${type} character)`,
    section(dna.appearance),
    section(dna.style),
    dna.personality.traits || dna.personality.communicationStyle
      ? `personality: ${section(dna.personality)}`
      : "",
  ].filter(Boolean);
  return `${parts.join(". ")}. Always depict this exact same character, consistent across images.`;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listCharacters(userId: string): Promise<Character[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("characters")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) {
    if (tableMissing(error.message)) return [];
    throw new Error(error.message);
  }
  return (data as Character[]) ?? [];
}

export async function getCharacter(userId: string, id: string): Promise<Character | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("characters").select("*").eq("user_id", userId).eq("id", id).maybeSingle();
  if (error) return null;
  return (data as Character) ?? null;
}

export type CreateCharacterInput = {
  name: string;
  type: CharacterType;
  role?: string | null;
  collection?: string | null;
  dna: CharacterDna;
  identityType?: "fictional" | "real_person" | "brand_owned";
  consentNote?: string | null;
  brandLinked?: boolean;
  parentId?: string | null;
  version?: number;
  referenceImages?: string[] | null;
};

export async function createCharacter(userId: string, input: CreateCharacterInput): Promise<Character> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("characters")
    .insert({
      user_id: userId,
      parent_id: input.parentId ?? null,
      version: input.version ?? 1,
      name: input.name.slice(0, 120),
      type: input.type,
      role: input.role?.slice(0, 120) ?? null,
      collection: input.collection?.slice(0, 120) ?? null,
      dna: input.dna,
      prompt_profile: buildPromptProfile(input.name, input.type, input.role ?? null, input.dna),
      reference_images: input.referenceImages ?? null,
      brand_linked: input.brandLinked ?? false,
      identity_type: input.identityType ?? "fictional",
      consent_note: input.consentNote ?? null,
    })
    .select("*")
    .single();
  if (error) {
    if (tableMissing(error.message)) throw new Error("Character Studio isn't set up yet (migration 0023).");
    throw new Error(error.message);
  }
  return data as Character;
}

/** Edits bump the version counter (duplication is the "new era" path). */
export async function updateCharacter(
  userId: string,
  id: string,
  fields: Partial<Pick<CreateCharacterInput, "name" | "role" | "collection" | "dna" | "identityType" | "consentNote" | "brandLinked">>,
): Promise<Character | null> {
  const current = await getCharacter(userId, id);
  if (!current) return null;
  const admin = createAdminClient();
  const name = fields.name ?? current.name;
  const role = fields.role !== undefined ? fields.role : current.role;
  const dna = fields.dna ?? current.dna;
  const { data, error } = await admin
    .from("characters")
    .update({
      name: name.slice(0, 120),
      role: role?.slice(0, 120) ?? null,
      collection: fields.collection !== undefined ? fields.collection?.slice(0, 120) ?? null : current.collection,
      dna,
      prompt_profile: buildPromptProfile(name, current.type, role ?? null, dna),
      identity_type: fields.identityType ?? current.identity_type,
      consent_note: fields.consentNote !== undefined ? fields.consentNote : current.consent_note,
      brand_linked: fields.brandLinked ?? current.brand_linked,
      version: current.version + (fields.dna ? 1 : 0),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Character;
}

export async function duplicateCharacter(userId: string, id: string, newName?: string): Promise<Character | null> {
  const src = await getCharacter(userId, id);
  if (!src) return null;
  return createCharacter(userId, {
    name: newName?.trim() || `${src.name} (copy)`,
    type: src.type,
    role: src.role,
    collection: src.collection,
    dna: src.dna,
    identityType: src.identity_type,
    consentNote: src.consent_note,
    brandLinked: src.brand_linked,
    parentId: src.id,
    referenceImages: src.reference_images,
  });
}

export async function archiveCharacter(userId: string, id: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("characters")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
}

export async function setCharacterPortrait(userId: string, id: string, url: string): Promise<void> {
  const current = await getCharacter(userId, id);
  if (!current) return;
  const rest = (current.reference_images ?? []).filter((u) => u !== url);
  const admin = createAdminClient();
  await admin
    .from("characters")
    .update({ reference_images: [url, ...rest].slice(0, 6), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
}

export async function recordCharacterUsage(userId: string, id: string): Promise<void> {
  const current = await getCharacter(userId, id);
  if (!current) return;
  const admin = createAdminClient();
  await admin
    .from("characters")
    .update({ usage_count: current.usage_count + 1, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id);
}

// ── Conversational creator: description → structured DNA ─────────────────────

const DNA_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    role: { type: "string" },
    appearance: { type: "object", additionalProperties: { type: "string" } },
    style: { type: "object", additionalProperties: { type: "string" } },
    personality: { type: "object", additionalProperties: { type: "string" } },
    voice: { type: "object", additionalProperties: { type: "string" } },
    professional: { type: "object", additionalProperties: { type: "string" } },
  },
  required: ["name", "role", "appearance", "style", "personality", "voice", "professional"],
  additionalProperties: false,
};

export type ComposedCharacter = { name: string; role: string; dna: CharacterDna };

export async function composeCharacter(description: string, type: CharacterType): Promise<ComposedCharacter> {
  const out = await anthropicJson<{ name: string; role: string } & CharacterDna>({
    system: [
      `You design a reusable ${type} marketing character from a short description. Return structured Character DNA:`,
      "- name: a fitting first name (or mascot/robot name).",
      "- role: their profession/role in one short phrase.",
      "- appearance: concrete visual keys (for humans: age, hair, eyes, build, distinguishingFeature — do NOT",
      "  include ethnicity unless the user's description asks; for animals: species, breed, color, size,",
      "  anthropomorphicLevel; for robots: bodyStyle, materials, face, colors).",
      "- style: clothing, accessories, visualStyle, colors.",
      "- personality: traits, energy, communicationStyle, humor.",
      "- voice: genderPresentation, ageStyle, tone, accent, speed (descriptive only).",
      "- professional: profession, industry, expertise, location (empty strings when N/A).",
      "Keep every value SHORT and concrete (a phrase, not sentences) — these become stable generation prompts.",
      "Avoid stereotypes; make the character feel specific and memorable.",
    ].join("\n"),
    user: description,
    schema: DNA_SCHEMA,
    maxTokens: 1200,
  });
  const { name, role, ...sections } = out;
  return {
    name,
    role,
    dna: {
      appearance: sections.appearance ?? {},
      style: sections.style ?? {},
      personality: sections.personality ?? {},
      voice: sections.voice ?? {},
      professional: sections.professional ?? {},
    },
  };
}

/** Compact persona block other engines (remix, composer) can inject. */
export function personaBlock(c: Character): string {
  return [
    `PRESENTER: ${c.name}${c.role ? `, ${c.role}` : ""} — ${c.type} character.`,
    c.prompt_profile ? `Look (keep consistent): ${c.prompt_profile}` : "",
    Object.values(c.dna.voice ?? {}).some(Boolean)
      ? `Voice/delivery: ${Object.values(c.dna.voice).filter(Boolean).join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
