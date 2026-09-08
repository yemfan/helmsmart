// Lighthouse on the CloseBoss dashboard, signed in as the test agent.
//
// lighthouse.yml measures the public site; nothing measured the app behind
// login — the pages a paying agent actually spends the day on. This signs
// in through the real form (same secrets as axe-dashboard.mjs), then runs
// Lighthouse against each core route through the signed-in browser, desktop
// preset, and writes lighthouse-results/dashboard.json plus one HTML report
// per route.
//
// Gate: performance category and the three Core Web Vitals lab proxies, at
// the SAME thresholds .lighthouserc.json holds the public site to
// (performance ≥ 0.85, LCP ≤ 2.5 s, CLS ≤ 0.1, TBT ≤ 200 ms). GATE=off
// reports without failing — the first runs establish the baseline.

import { chromium } from "playwright";
import lighthouse from "lighthouse";
import { mkdirSync, writeFileSync } from "node:fs";

const HOST = (process.env.HOST || "https://www.closebossai.com").replace(/\/$/, "");
const EMAIL = process.env.AXE_TEST_EMAIL;
const PASSWORD = process.env.AXE_TEST_PASSWORD;
const GATE = (process.env.GATE || "on").toLowerCase() !== "off";
const RUNS = Math.max(1, Number(process.env.RUNS ?? 3) || 3);
if (!EMAIL || !PASSWORD) {
  console.error("AXE_TEST_EMAIL / AXE_TEST_PASSWORD are not set.");
  process.exit(2);
}

const ROUTES = [
  "/dashboard",
  "/dashboard/contacts",
  "/dashboard/inbox",
  "/dashboard/tasks",
  "/dashboard/calendar",
  "/dashboard/settings",
];
const THRESHOLDS = { performance: 0.85, lcp: 2500, cls: 0.1, tbt: 200 };
const PORT = 9222;

// A persistent context IS the browser's default context, so the tab
// Lighthouse opens over the debugging port shares its cookies. With an
// isolated `browser.newContext()` Lighthouse's tab had no session, every
// route redirected to /login, and six identical scores measured the login
// page (the first run, 2026-09-08).
const context = await chromium.launchPersistentContext("/tmp/lh-profile", {
  args: [`--remote-debugging-port=${PORT}`],
  viewport: { width: 1440, height: 900 },
  locale: "en-US",
});
const page = await context.newPage();

await page.goto(`${HOST}/login`, { waitUntil: "networkidle" });
for (let attempt = 0; attempt < 10; attempt++) {
  await page.fill("#login-email", EMAIL);
  await page.waitForTimeout(500);
  if ((await page.inputValue("#login-email")) === EMAIL) break;
}
await page.fill("#login-password", PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
console.log(`Signed in; landed on ${new URL(page.url()).pathname}`);

mkdirSync("lighthouse-results", { recursive: true });
const results = [];
let failing = 0;
for (const route of ROUTES) {
  const url = `${HOST}${route}`;
  // Warm the route first. The job often runs minutes after a deploy, when
  // every function is cold, and a single cold hit then stands in for the
  // route's score: the same commit measured 79 and 68 on Ask Max in two runs
  // twenty minutes apart (2026-09-08). Steady state is what agents see.
  await page.goto(url, { waitUntil: "networkidle" }).catch(() => {});
  process.stdout.write(`Lighthouse ${url} ×${RUNS} ... `);
  // Median of several runs. Even warmed, the same commit's document time
  // swung from 0.6 s to 2.6 s between runs (another instance, a slow query)
  // and the score tracked it exactly — 84 against 61. One sample cannot
  // gate on that; the middle of three can.
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    runs.push(
      await lighthouse(url, {
        port: PORT,
        output: ["html"],
        logLevel: "error",
        onlyCategories: ["performance"],
        // Desktop preset, same as the public-site job, so numbers compare.
        formFactor: "desktop",
        screenEmulation: { mobile: false, width: 1440, height: 900, deviceScaleFactor: 1, disabled: false },
        throttlingMethod: "devtools",
        throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
        // Lighthouse's own user agent is on Next's default `htmlLimitedBots`
        // list, which turns streaming off: the <head> (and so the CSS and
        // fonts) arrived only once the whole page had rendered. Real Chrome
        // gets the shell at first byte; measure that.
        emulatedUserAgent: false,
      }),
    );
  }
  runs.sort((a, b) => (a.lhr.audits["largest-contentful-paint"]?.numericValue ?? 0) - (b.lhr.audits["largest-contentful-paint"]?.numericValue ?? 0));
  const run = runs[Math.floor(runs.length / 2)];
  const lhr = run.lhr;
  const landed = new URL(lhr.finalDisplayedUrl || url).pathname;
  const m = {
    url,
    landed,
    performance: lhr.categories.performance?.score ?? null,
    lcp: lhr.audits["largest-contentful-paint"]?.numericValue ?? null,
    cls: lhr.audits["cumulative-layout-shift"]?.numericValue ?? null,
    tbt: lhr.audits["total-blocking-time"]?.numericValue ?? null,
    fcp: lhr.audits["first-contentful-paint"]?.numericValue ?? null,
    speedIndex: lhr.audits["speed-index"]?.numericValue ?? null,
    // The biggest opportunities, for the fix list.
    opportunities: Object.values(lhr.audits)
      .filter((a) => a.details?.type === "opportunity" && (a.numericValue ?? 0) > 100)
      .sort((a, b) => (b.numericValue ?? 0) - (a.numericValue ?? 0))
      .slice(0, 5)
      .map((a) => ({ id: a.id, savingsMs: Math.round(a.numericValue ?? 0), title: a.title })),
  };
  results.push(m);
  const bad = [];
  if (m.performance !== null && m.performance < THRESHOLDS.performance) bad.push(`perf ${Math.round(m.performance * 100)}`);
  if (m.lcp !== null && m.lcp > THRESHOLDS.lcp) bad.push(`LCP ${Math.round(m.lcp)}ms`);
  if (m.cls !== null && m.cls > THRESHOLDS.cls) bad.push(`CLS ${m.cls.toFixed(3)}`);
  if (m.tbt !== null && m.tbt > THRESHOLDS.tbt) bad.push(`TBT ${Math.round(m.tbt)}ms`);
  if (bad.length) failing++;
  if (landed !== route) {
    console.log(`✗ measured ${landed}, not ${route} — the session did not carry over; scores below are not the dashboard's`);
    failing++;
  }
  console.log(
    `${bad.length ? "✗" : "✓"} perf ${m.performance === null ? "?" : Math.round(m.performance * 100)} · LCP ${Math.round(m.lcp ?? 0)}ms · CLS ${(m.cls ?? 0).toFixed(3)} · TBT ${Math.round(m.tbt ?? 0)}ms${bad.length ? `  ← ${bad.join(", ")}` : ""}`,
  );
  for (const o of m.opportunities) console.log(`      ~${o.savingsMs}ms  ${o.id}`);
  writeFileSync(`lighthouse-results/${route.replace(/[^a-z0-9]+/gi, "_").replace(/^_/, "") || "root"}.html`, run.report[0]);
}
writeFileSync("lighthouse-results/dashboard.json", JSON.stringify({ thresholds: THRESHOLDS, results }, null, 2));
await context.close();

console.log(`\n${results.length} routes, median of ${RUNS} runs each — ${failing} below threshold${GATE ? "" : " (GATE=off, reporting only)"}.`);
process.exit(GATE && failing > 0 ? 1 : 0);
