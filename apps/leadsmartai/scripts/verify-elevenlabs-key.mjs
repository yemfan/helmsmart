/**
 * Verify the ElevenLabs key actually works for what CloseBoss needs, before
 * spending a clone attempt: auth, remaining character quota, and the voice
 * permissions the digital twin depends on. Read-only — costs nothing.
 *   node apps/leadsmartai/scripts/verify-elevenlabs-key.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const key = src.match(/^ELEVENLABS_API_KEY\s*=\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "");

if (!key) {
  console.error("No ELEVENLABS_API_KEY in .env.local");
  process.exit(1);
}
console.log(`key: ${key.startsWith("sk_") ? "sk_ (correct type)" : "WRONG TYPE"}  len=${key.length}\n`);

const H = { "xi-api-key": key };

// 1. Auth + quota
const uRes = await fetch("https://api.elevenlabs.io/v1/user", { headers: H });
const u = await uRes.json().catch(() => ({}));
if (!uRes.ok) {
  console.error(`AUTH FAILED (${uRes.status}): ${u?.detail?.message ?? JSON.stringify(u)}`);
  process.exit(1);
}
const s = u.subscription ?? {};
const used = s.character_count ?? 0;
const limit = s.character_limit ?? 0;
console.log("AUTH OK");
console.log(`  tier:       ${s.tier ?? "?"}`);
console.log(`  characters: ${used.toLocaleString()} / ${limit.toLocaleString()} used`);
console.log(`  remaining:  ${(limit - used).toLocaleString()}`);
console.log(`  can clone:  ${s.can_use_instant_voice_cloning ? "yes" : "NO — plan does not allow instant voice cloning"}`);

// 2. Voices read (the permission voice cloning needs)
const vRes = await fetch("https://api.elevenlabs.io/v1/voices", { headers: H });
const v = await vRes.json().catch(() => ({}));
if (!vRes.ok) {
  console.error(`\nVOICES READ FAILED (${vRes.status}): ${v?.detail?.message ?? JSON.stringify(v)}`);
  process.exit(1);
}
const cloned = (v.voices ?? []).filter((x) => x.category === "cloned");
console.log(`\nVOICES OK — ${v.voices?.length ?? 0} total, ${cloned.length} cloned`);
for (const c of cloned.slice(0, 5)) console.log(`  ${c.voice_id}  ${c.name}`);
