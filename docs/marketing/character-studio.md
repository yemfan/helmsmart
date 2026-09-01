# MarketingBoss — Character Studio

Create characters your audience remembers. A persistent cast per business:
create once, reuse across every asset the workforce produces.

## Step 1–2: audit — what already exists (reuse map)

| Charter component | Existing implementation | Gap |
|---|---|---|
| Image consistency | `lib/fal.ts` nano-banana **edit accepts reference images** (`imageUrl(s)` routes to the edit model) — the identity anchor | No persistent character record holding the reference |
| Talking-person video + voice | UGC studio (Seedance) generates creator-style video **with voice from prompt text** | Voice/persona described ad-hoc each time |
| Face/product swap | Swap mode (Kling O1) — reference image drives identity in video edits | Same: no persistent reference |
| Media storage | Supabase `media` bucket, user-folder writes | — |
| Brand link | `brand_kits` (+ 0021 business profile) | Character↔brand flag |
| "Who presents it" hook | Viral Remix (`/api/viral/[id]/remix`) + composer intent prefill | Remix is presenter-less |
| Conversational creation | `anthropicJson` structured-output idiom everywhere | — |
| Asset trail | `generations` table (every render) | No `character_id` on assets |
| Voice cloning | ElevenLabs exists in the *CloseBoss* digital-twin stack, NOT in MB env | **Voice = DNA metadata only in MVP**; provider abstraction documented, no TTS claimed |

## Consistency — honest design
No provider guarantees perfect identity. We maximize it with: a **stable
`prompt_profile`** (deterministic descriptor derived from Character DNA, reused
verbatim in every generation) + a **canonical portrait** (generated once,
stored as `reference_images[0]`, fed to fal's edit/i2v models as the identity
reference) + consistent parameters. The UI never promises "identical", it
promises "recognizably the same character".

## MVP (this build)
- **Migration 0023**: `characters` (owner-RLS) — type (human/animal/robot/creature/mascot),
  role, collection, **dna jsonb** (appearance/style/personality/voice/professional),
  `prompt_profile`, `reference_images[]`, version + parent_id (duplication/lineage),
  brand_linked, **responsible-design fields** (identity_type fictional/real_person/brand_owned +
  consent_note), usage_count, status. Plus `generations.character_id` (asset traceability).
- **lib/characters.ts**: CRUD, `buildPromptProfile(dna)`, conversational creator
  (description → structured DNA), usage counting; pre-migration tolerant.
- **APIs**: GET/POST `/api/characters`, GET/PATCH/DELETE `/api/characters/[id]`,
  POST `/[id]/duplicate`, POST `/[id]/portrait` (1 credit; canonical reference;
  tags the `generations` row).
- **UI** `/studio/characters` (Studio is the constitution-sanctioned home for pro
  tools): card library w/ portraits, type/collection filters + text search,
  guided creation (type → describe → AI-composed DNA preview → save), edit,
  duplicate, archive, per-card **Use character** → prefilled composer.
- **Viral integration**: Remix accepts `characterId` — the remix is written *in
  that character's persona* and the intent carries the presenter.

## Versioning (MVP compromise, documented)
`version` counter + `parent_id` lineage; **Duplicate** is the "new era" path
(Sarah → Sarah Luxury Edition). Immutable per-version snapshots that old
assets pin to = Phase 2 (needs a `character_versions` table).

## Deferred (needs infra/credentials — not pretended)
- **Voice generation**: ElevenLabs (or other) not configured in MB → voice is
  descriptive DNA that flows into Seedance prompts; TTS provider abstraction
  lands with credentials.
- Wardrobe/Scene libraries, multi-character scenes, character recommendations,
  performance analytics rollups, admin moderation console → Phases 2–3 per charter.
