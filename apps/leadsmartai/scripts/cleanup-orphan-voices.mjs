/**
 * Delete ElevenLabs cloned voices that no agent references any more.
 *
 * Re-cloning used to leave the previous voice behind (fixed in voiceClone.ts,
 * but the strays it already created are still there). ElevenLabs caps custom
 * voices per plan, so orphans eventually break cloning for EVERY agent.
 *
 * Safety:
 *   - The keep-set is read from the DATABASE, never hardcoded — a voice is
 *     deleted only if no agent_voice_settings row points at it.
 *   - Dry-run by default. Pass --confirm to actually delete.
 *   - Only touches category "cloned"; premade/stock voices are never listed.
 *
 *   node apps/leadsmartai/scripts/cleanup-orphan-voices.mjs
 *   node apps/leadsmartai/scripts/cleanup-orphan-voices.mjs --confirm
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CONFIRM = process.argv.includes("--confirm");

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(join(__dirname, "..", ".env.local"), "utf8");
const read = (k) => env.match(new RegExp(`^${k}\\s*=\\s*(.+)$`, "m"))?.[1].trim().replace(/^["']|["']$/g, "");

const supabaseUrl = read("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
const elevenKey = read("ELEVENLABS_API_KEY");
if (!supabaseUrl || !serviceKey || !elevenKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / ELEVENLABS_API_KEY");
  process.exit(1);
}

// 1. Every voice id any agent still points at — the keep-set.
const rowsRes = await fetch(
  `${supabaseUrl}/rest/v1/agent_voice_settings?select=agent_id,voice_clone_remote_id`,
  { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
);
if (!rowsRes.ok) {
  console.error(`Could not read agent_voice_settings (${rowsRes.status}): ${await rowsRes.text()}`);
  process.exit(1);
}
const rows = await rowsRes.json();
const keep = new Map();
for (const r of rows) {
  const id = r.voice_clone_remote_id?.trim();
  if (id) keep.set(id, r.agent_id);
}

// 2. Every cloned voice that actually exists at ElevenLabs.
const vRes = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": elevenKey } });
if (!vRes.ok) {
  console.error(`Could not list voices (${vRes.status}): ${await vRes.text()}`);
  process.exit(1);
}
const cloned = ((await vRes.json()).voices ?? []).filter((v) => v.category === "cloned");

const orphans = cloned.filter((v) => !keep.has(v.voice_id));

console.log(`Cloned voices at ElevenLabs: ${cloned.length}`);
for (const v of cloned) {
  const owner = keep.get(v.voice_id);
  console.log(`  ${owner ? "KEEP  " : "ORPHAN"}  ${v.voice_id}  ${v.name}${owner ? `  (agent ${owner})` : ""}`);
}

if (orphans.length === 0) {
  console.log("\nNothing to clean up.");
  process.exit(0);
}
if (!CONFIRM) {
  console.log(`\n${orphans.length} orphan(s). Re-run with --confirm to delete them.`);
  process.exit(0);
}

for (const v of orphans) {
  const res = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(v.voice_id)}`, {
    method: "DELETE",
    headers: { "xi-api-key": elevenKey },
  });
  console.log(res.ok ? `Deleted ${v.voice_id} (${v.name})` : `FAILED ${v.voice_id} (${res.status})`);
}
