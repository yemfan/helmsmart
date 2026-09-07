// axe-core scan of the CloseBoss dashboard, signed in as the test agent.
//
// Runs from a scratch directory where playwright + axe-core are installed
// (see .github/workflows/axe-dashboard.yml). Signs in through the real login
// form with AXE_TEST_EMAIL / AXE_TEST_PASSWORD, then audits each dashboard
// route with the WCAG 2.x A/AA rule set and writes axe-results/dashboard.json
// in the same shape as @axe-core/cli's --save, so the two reports read alike.
//
// Gate: any `critical` or `serious` violation fails the run (the audit's bar:
// zero critical or serious on the core routes). Moderate/minor are printed
// but do not fail — the public-route job is stricter because those pages
// are small; the dashboard gets there route by route.

import { chromium } from "playwright";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const HOST = (process.env.HOST || "https://www.closebossai.com").replace(/\/$/, "");
const EMAIL = process.env.AXE_TEST_EMAIL;
const PASSWORD = process.env.AXE_TEST_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("AXE_TEST_EMAIL / AXE_TEST_PASSWORD are not set — add them as repository secrets.");
  process.exit(2);
}

const ROUTES = [
  "/dashboard",
  "/dashboard/contacts",
  "/dashboard/inbox",
  "/dashboard/tasks",
  "/dashboard/calendar",
  "/dashboard/transactions",
  "/dashboard/cma",
  "/dashboard/settings",
  "/dashboard/settings/account",
  "/dashboard/settings/ai-team",
  "/dashboard/notifications",
];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];
const FAIL_ON = new Set(["critical", "serious"]);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "en-US" });
const page = await context.newPage();

// Sign in through the form, exactly as a person would.
// The form is a client component: clicking before React has hydrated does a
// native GET submit back to /login (the first run failed exactly so). Wait
// for the network to settle, then prove hydration by typing and reading back
// — a controlled input that has hydrated keeps the value.
await page.goto(`${HOST}/login`, { waitUntil: "networkidle" });
for (let attempt = 0; attempt < 10; attempt++) {
  await page.fill("#login-email", EMAIL);
  await page.waitForTimeout(500);
  if ((await page.inputValue("#login-email")) === EMAIL) break;
}
await page.fill("#login-password", PASSWORD);
await page.click('button[type="submit"]');
try {
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
} catch {
  const alert = await page.locator('[role="alert"], .text-red-600, .text-rose-600').allInnerTexts().catch(() => []);
  console.error(`Sign-in did not leave /login. Page said: ${alert.join(" | ") || "(nothing)"}`);
  process.exit(3);
}
console.log(`Signed in; landed on ${new URL(page.url()).pathname}`);

const results = [];
let failing = 0;
for (const route of ROUTES) {
  const url = `${HOST}${route}`;
  process.stdout.write(`Testing ${url} ... `);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  } catch {
    // networkidle can starve on a page that polls; the DOM is there anyway.
  }
  await page.waitForTimeout(1500);
  await page.addScriptTag({ content: AXE_SOURCE });
  const r = await page.evaluate(
    async (tags) => {
      // The hidden streamed copies (<div hidden id="S:0">) are excluded by
      // axe's own hidden-element handling; nothing to configure.
      return await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    },
    TAGS,
  );
  const violations = r.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    helpUrl: v.helpUrl,
    nodes: v.nodes.map((n) => ({ target: n.target, html: n.html, failureSummary: n.failureSummary })),
  }));
  results.push({ url, timestamp: new Date().toISOString(), violations, passes: r.passes.length });
  const bad = violations.filter((v) => FAIL_ON.has(v.impact));
  failing += bad.length;
  if (violations.length === 0) console.log("clean");
  else {
    console.log("");
    for (const v of violations) {
      console.log(`  ${FAIL_ON.has(v.impact) ? "✗" : "·"} ${v.id} (${v.impact}) × ${v.nodes.length} — ${v.help}`);
      for (const n of v.nodes.slice(0, 3)) console.log(`      ${n.target[0]}`);
    }
  }
}

mkdirSync("axe-results", { recursive: true });
writeFileSync("axe-results/dashboard.json", JSON.stringify(results, null, 2));
await browser.close();

console.log(`\nTesting complete of ${ROUTES.length} routes — ${failing} critical/serious violation type(s).`);
process.exit(failing > 0 ? 1 : 0);
