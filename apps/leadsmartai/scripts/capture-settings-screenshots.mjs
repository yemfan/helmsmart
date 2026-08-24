/**
 * Usage (from the repo root, with a dev server running):
 *
 *   node apps/leadsmartai/scripts/capture-settings-screenshots.mjs  *     apps/leadsmartai/.env.local  *     apps/leadsmartai/public/help/settings  *     <sandbox-account-email> [app-origin]
 *
 * app-origin defaults to http://localhost:3031.
 *
 * Re-run this after changing the Settings UI so /help/settings does not show a
 * screenshot of a card that no longer looks like that.
 */
/**
 * Capture one screenshot per Settings card, for the help center.
 *
 * Auth: mints a session server-side with the service-role key (admin
 * generate_link -> verify) and writes the @supabase/ssr session cookie straight
 * into the Playwright context. No password is typed anywhere.
 *
 * Account: the SANDBOXED test agent, never the owner's real one — these images
 * get published on public help pages.
 *
 * Two things this has to get right, both learned the hard way:
 *
 *  - Card boundaries. A tab is either a list of `div.rounded-xl` cards, or ONE
 *    `divide-y` container whose children are the cards. Two panels instead
 *    render their own `section.rounded-2xl` outside that structure, so they get
 *    a separate pass — folding them into the main query changes which element
 *    counts as "outermost" and collapses the whole list to nothing.
 *
 *  - Waiting. Tab content mounts client-side and fetches per panel. A fixed
 *    sleep is flaky, so wait for cards to actually appear before capturing.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

// 4th arg rather than an env var: turbo.json has to declare every env var the
// repo reads, and a dev-only script has no business in the build allowlist.
const [, , ENV_FILE, OUT_DIR, EMAIL, ORIGIN] = process.argv;
const APP = ORIGIN || "http://localhost:3031";

function readEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnv(ENV_FILE);
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error("missing supabase env");

const COOKIE_NAME = `sb-${new URL(URL_).hostname.split(".")[0]}-auth-token-leadsmart`;
const b64url = (s) =>
  Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function chunk(name, value, size = 3180) {
  if (value.length <= size) return [{ name, value }];
  const out = [];
  for (let i = 0, n = 0; i < value.length; i += size, n++) {
    out.push({ name: `${name}.${n}`, value: value.slice(i, i + size) });
  }
  return out;
}

async function mintSession(email) {
  const gen = await fetch(`${URL_}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!gen.ok) throw new Error(`generate_link ${gen.status}: ${await gen.text()}`);
  const link = await gen.json();
  const hashed = link.hashed_token || link.properties?.hashed_token;
  if (!hashed) throw new Error("no hashed_token");
  const ver = await fetch(`${URL_}/auth/v1/verify`, {
    method: "POST",
    headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ type: "magiclink", token_hash: hashed }),
    redirect: "manual",
  });
  if (!ver.ok) throw new Error(`verify ${ver.status}: ${await ver.text()}`);
  return ver.json();
}

const TABS = ["Voice & Style", "Messages", "Data & Tools", "Channels & Compliance"];
const slug = (s) =>
  s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);

/** Sections whose contents are live customer data — never publish these. */
const PII_SECTIONS = ["Recent calls", "Missed call activity", "Call history", "Agent roster"];

/** Enumerate the cards currently on screen. Runs in the page. */
const ENUMERATE = () => {
  const visible = (e) => e.getClientRects().length > 0 && e.getBoundingClientRect().height > 40;

  const divs = [...document.querySelectorAll("div")].filter((e) => {
    const c = (e.className || "").toString();
    return c.includes("rounded-xl") && c.includes("border") && visible(e);
  });
  const outer = divs.filter((e) => !divs.some((o) => o !== e && o.contains(e)));

  const secs = [];
  for (const c of outer) {
    if (/\bdivide-y\b/.test((c.className || "").toString())) {
      secs.push(...[...c.children].filter(visible));
    } else {
      secs.push(c);
    }
  }

  // Separate pass: panels that render their own <section rounded-2xl>.
  for (const s of [...document.querySelectorAll("section")]) {
    const c = (s.className || "").toString();
    if (!c.includes("rounded-2xl") || !c.includes("border") || !visible(s)) continue;
    if (!secs.some((x) => x === s || x.contains(s))) secs.push(s);
  }

  document.querySelectorAll("[data-shot]").forEach((e) => e.removeAttribute("data-shot"));
  return secs.map((s, i) => {
    s.setAttribute("data-shot", String(i));
    const h = s.querySelector("h1,h2,h3,h4");
    return {
      i,
      title: (h?.textContent || "").trim().split("\n")[0].trim(),
      h: Math.round(s.getBoundingClientRect().height),
    };
  });
};

const session = await mintSession(EMAIL);
const cookies = chunk(COOKIE_NAME, "base64-" + b64url(JSON.stringify(session))).map((c) => ({
  ...c, domain: "localhost", path: "/", httpOnly: false, secure: false, sameSite: "Lax",
}));

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 1200 }, deviceScaleFactor: 2 });
await ctx.addCookies(cookies);
const page = await ctx.newPage();

await page.goto(`${APP}/dashboard/settings`, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(8000);
if (/\/login|\/signin/.test(page.url())) {
  console.log("AUTH FAILED —", page.url());
  await browser.close();
  process.exit(1);
}
console.log("authenticated");

for (const label of ["Essential only", "Reject all", "Decline"]) {
  try {
    await page.getByRole("button", { name: label, exact: false }).first().click({ timeout: 3000 });
    console.log(`cookie banner: ${label}`);
    await page.waitForTimeout(1000);
    break;
  } catch { /* next */ }
}

const captured = [];
for (const tab of TABS) {
  try {
    await page.getByRole("tab", { name: tab, exact: true }).click({ timeout: 20000 });
  } catch {
    console.log(`TAB MISS: ${tab}`);
    continue;
  }

  // Wait for this tab's cards to actually mount, rather than sleeping blindly.
  let sections = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    await page.waitForTimeout(2500);
    sections = await page.evaluate(ENUMERATE);
    const named = sections.filter((s) => s.title && s.h >= 60);
    if (named.length >= 2) {
      // One more settle pass so async panels finish painting.
      await page.waitForTimeout(2500);
      sections = await page.evaluate(ENUMERATE);
      break;
    }
  }

  const named = sections.filter((s) => s.title && s.h >= 60);
  console.log(`\n[${tab}] ${named.length} cards`);
  if (!named.length) continue;

  // Hide live-data sections before capturing anything on this tab.
  await page.evaluate((titles) => {
    for (const h of [...document.querySelectorAll("h1,h2,h3,h4")]) {
      const t = (h.textContent || "").trim();
      if (!titles.some((x) => t.startsWith(x))) continue;
      h.style.display = "none";
      let sib = h.nextElementSibling;
      while (sib) { sib.style.display = "none"; sib = sib.nextElementSibling; }
    }
  }, PII_SECTIONS);
  await page.waitForTimeout(500);

  for (const s of named) {
    if (PII_SECTIONS.some((x) => s.title.startsWith(x))) {
      console.log(`  skip ${s.title} (live customer data)`);
      continue;
    }
    const file = path.join(OUT_DIR, `${slug(s.title)}.png`);
    try {
      const el = page.locator(`[data-shot="${s.i}"]`);
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await el.screenshot({ path: file });
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log(`  OK  ${slug(s.title)}.png  ${kb} KB  h=${s.h}`);
      captured.push({ name: s.title, slug: slug(s.title), tab, height: s.h });
    } catch (e) {
      console.log(`  MISS ${s.title}: ${String(e.message).split("\n")[0].slice(0, 70)}`);
    }
  }
}

await browser.close();
console.log(`\ncaptured ${captured.length} cards`);
