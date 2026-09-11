/**
 * Every user-facing entry point that works on the cookie org goes through the
 * membership guard.
 *
 * The bug this keeps fixed: server actions read `helmsmart-org-id` straight
 * from the cookie and then wrote with the service-role client, which bypasses
 * RLS — so the only thing standing between a caller and another business's
 * data was knowing that business's UUID. The cookie is the caller's to set;
 * `proxy.ts` does not check membership, and server actions can be POSTed to any
 * route anyway.
 *
 * This reads the source (TypeScript's parser, no type-checking) and enforces
 * three rules:
 *
 *   1. No `"use server"` module or `app/api` route handler reads the org cookie
 *      itself. The only way to get the active org id is `requireOrgMember()` /
 *      `getMemberOrgId()` from `lib/auth/org-context.ts`, which checks
 *      membership — so an action cannot even name the org without the check.
 *
 *   2. Every exported server action and route handler that can reach the
 *      service-role client (directly, or through any helper in this app it
 *      calls) also reaches `requireOrgMember()` — unless it is on the explicit
 *      allow-list below, with the reason it has no user to check.
 *
 *   3. Anywhere else in the app (pages, components, lib), a function that reads
 *      the org cookie itself must not also reach the service-role client: that
 *      is the same hole, rendered instead of POSTed.
 *
 * Reachability follows plain calls — `foo()` to a function declared in the same
 * file or imported by name from `@/…` or a relative path. It does not follow
 * method calls or dynamic imports. That is deliberately the shape every action
 * here has; if a new one hides the service client behind something this cannot
 * see, it has also hidden it from the next reader.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = ["app", "lib", "components"];
const GUARD_FILE = "lib/auth/org-context.ts";
const GUARD_FN = "requireOrgMember";
const ORG_COOKIE_NAMES = new Set(["helmsmart-org-id", "smbai-org-id"]);
const ORG_COOKIE_CONSTS = new Set(["ORG_COOKIE", "LEGACY_ORG_COOKIE"]);
const SERVICE_CALLEES = new Set(["createServiceClient", "createServiceClientFor", "forEachPackService"]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/**
 * Route handlers that reach the service-role client with no org membership to
 * check. Each authenticates some other way and resolves the org from what it
 * was sent, never from the org cookie (rule 1 still applies to them).
 */
const NO_MEMBER_ROUTES: Record<string, string> = {
  // ── Provider webhooks: signature- or secret-authenticated, org from payload ──
  "app/api/twilio/sms/route.ts": "Twilio inbound SMS webhook — org resolved from the To number",
  "app/api/twilio/sms/status/route.ts": "Twilio delivery-status callback — keyed by message SID",
  "app/api/twilio/voice/route.ts": "Twilio inbound voice webhook — org resolved from the called number",
  "app/api/twilio/voice/respond/route.ts": "Twilio voice gather callback — org from the call",
  "app/api/twilio/voice/status/route.ts": "Twilio call-status callback — keyed by call SID",
  "app/api/retell/webhook/route.ts": "Retell call-event webhook — signature-verified, org from the call",
  "app/api/retell/inbound/route.ts": "Retell inbound-call webhook — ?k= secret, org from the number",
  "app/api/retell/function/route.ts": "Retell agent function calls — ?k= secret, org from the call",
  "app/api/stripe/webhook/route.ts": "Stripe webhook — signature-verified, org from event metadata",
  "app/api/resend/inbound/route.ts": "Resend inbound-email webhook — org from the recipient address",
  // ── Vercel cron: CRON_SECRET bearer, iterate every org ──
  "app/api/cron/approvals/timeout/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/bills/recurring/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/digest/weekly/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/email/campaigns/send/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/email/recurring/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/google/reviews/sync/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/insights/weekly/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/invoices/overdue/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/invoices/recurring/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/invoices/reminders/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/projects/recurring/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/sms/campaigns/send/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/social/generate/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/social/publish/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/tasks/recurring/route.ts": "cron (CRON_SECRET)",
  "app/api/cron/voice/reminders/route.ts": "cron (CRON_SECRET)",
  // ── Public, token-scoped pages for the org's CUSTOMERS (no HelmSmart login) ──
  "app/api/forms/[slug]/route.ts": "public form submission — org from the form slug",
  "app/api/reschedule/[token]/route.ts": "customer reschedule link — org from the unguessable token",
  "app/api/estimates/[id]/respond/route.ts": "customer accepts/declines an estimate from its public link",
  "app/api/stripe/checkout/route.ts": "customer pays an invoice from its public /pay link — the invoice id is the capability",
};

/**
 * Exported server actions that reach the service-role client with no active
 * org to check — `"file#function"`. Keep this short.
 */
const NO_MEMBER_ACTIONS: Record<string, string> = {
  "lib/actions/team.ts#acceptInvitation":
    "the invitee is not a member YET — authorized by the signed-in user plus an unexpired, unaccepted invite token",
};

/**
 * Route handlers allowed to read the org cookie themselves (rule 1). Only for
 * a routing hint that touches no org data — the test also checks they cannot
 * reach the service client.
 */
const COOKIE_HINT_ONLY: Record<string, string> = {
  "app/api/auth/callback/route.ts":
    "post-sign-in redirect to /home vs /onboarding; both destinations check membership themselves",
};

// ─── Source model ───────────────────────────────────────────────────────────

type Fn = { name: string; body: ts.Node; exported: boolean };
type Mod = {
  rel: string;
  sf: ts.SourceFile;
  useServer: boolean;
  isRoute: boolean;
  fns: Map<string, Fn>;
  /** local name → [resolved module rel path | null, imported name] */
  imports: Map<string, [string | null, string]>;
};

function walk(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts"))
      out.push(full);
  }
}

const rel = (abs: string) => path.relative(ROOT, abs).split(path.sep).join("/");

function resolveImport(fromRel: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(ROOT, path.dirname(fromRel), spec);
  else return null;
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return rel(cand);
  }
  return null;
}

function hasExport(node: ts.Node): boolean {
  return (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;
}

function parse(abs: string): Mod {
  const r = rel(abs);
  const text = fs.readFileSync(abs, "utf8");
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, abs.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const first = sf.statements[0];
  const useServer =
    !!first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server";
  const mod: Mod = { rel: r, sf, useServer, isRoute: /^app\/api\/.*\/route\.tsx?$/.test(r), fns: new Map(), imports: new Map() };

  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier) && st.importClause?.namedBindings) {
      const target = resolveImport(r, st.moduleSpecifier.text);
      const nb = st.importClause.namedBindings;
      if (ts.isNamedImports(nb)) {
        for (const el of nb.elements) mod.imports.set(el.name.text, [target, (el.propertyName ?? el.name).text]);
      }
    } else if (ts.isFunctionDeclaration(st) && st.body) {
      const name = st.name?.text ?? "default";
      mod.fns.set(name, { name, body: st.body, exported: hasExport(st) });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) continue;
        let init: ts.Node = d.initializer;
        // `const x = cache(async () => …)` and friends: the function is the argument.
        if (ts.isCallExpression(init)) {
          const fnArg = init.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
          if (fnArg) init = fnArg;
        }
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          mod.fns.set(d.name.text, { name: d.name.text, body: init.body, exported: hasExport(st) });
        }
      }
    }
  }
  return mod;
}

function isOrgCookieRead(node: ts.Node): boolean {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== "get") return false;
  const arg = node.arguments[0];
  if (!arg) return false;
  if (ts.isStringLiteralLike(arg)) return ORG_COOKIE_NAMES.has(arg.text);
  return ts.isIdentifier(arg) && ORG_COOKIE_CONSTS.has(arg.text);
}

/** Direct facts about one function body: plain calls it makes, cookie reads. */
function facts(body: ts.Node) {
  const calls = new Set<string>();
  let readsCookie = false;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) calls.add(n.expression.text);
    if (isOrgCookieRead(n)) readsCookie = true;
    ts.forEachChild(n, visit);
  };
  visit(body);
  return { calls, readsCookie };
}

const files: string[] = [];
for (const d of SCAN_DIRS) walk(path.join(ROOT, d), files);
const mods = new Map<string, Mod>(files.map((f) => [rel(f), parse(f)]));

type Reach = { service: boolean; guard: boolean };
const memo = new Map<string, Reach>();

function reach(modRel: string, fnName: string, stack = new Set<string>()): Reach {
  const key = `${modRel}#${fnName}`;
  const cached = memo.get(key);
  if (cached) return cached;
  if (stack.has(key)) return { service: false, guard: false };
  const mod = mods.get(modRel);
  const fn = mod?.fns.get(fnName);
  if (!mod || !fn) return { service: false, guard: false };
  if (modRel === GUARD_FILE && fnName === GUARD_FN) return { service: false, guard: true };

  stack.add(key);
  const out: Reach = { service: false, guard: false };
  for (const callee of facts(fn.body).calls) {
    if (SERVICE_CALLEES.has(callee)) out.service = true;
    let sub: Reach | null = null;
    if (mod.fns.has(callee)) sub = reach(modRel, callee, stack);
    else if (mod.imports.has(callee)) {
      const [target, imported] = mod.imports.get(callee)!;
      if (target) sub = reach(target, imported, stack);
    }
    if (sub) {
      out.service ||= sub.service;
      out.guard ||= sub.guard;
    }
  }
  stack.delete(key);
  memo.set(key, out);
  return out;
}

const userFacing = [...mods.values()].filter((m) => m.useServer || m.isRoute);

/** The functions an outside caller can invoke: exported actions / HTTP handlers. */
function entryPoints(m: Mod): Fn[] {
  return [...m.fns.values()].filter((f) => f.exported && (m.useServer || HTTP_METHODS.has(f.name)));
}

// ─── Rules ──────────────────────────────────────────────────────────────────

describe("org membership guard coverage", () => {
  it("finds the modules it is meant to police (the scan is not vacuous)", () => {
    expect(userFacing.filter((m) => m.useServer).length).toBeGreaterThan(40);
    expect(userFacing.filter((m) => m.isRoute).length).toBeGreaterThan(50);
    // The action the bug report led with reaches both the service client and the guard.
    expect(reach("lib/actions/project-templates.ts", "createProjectTemplate")).toEqual({ service: true, guard: true });
  });

  it("rule 1: no server action or route handler reads the org cookie itself", () => {
    const offenders = userFacing
      .filter((m) => m.rel !== GUARD_FILE && !COOKIE_HINT_ONLY[m.rel])
      .filter((m) => {
        let found = false;
        const visit = (n: ts.Node) => {
          if (isOrgCookieRead(n)) found = true;
          else ts.forEachChild(n, visit);
        };
        visit(m.sf);
        return found;
      })
      .map((m) => m.rel);
    expect(offenders, "get the org id from requireOrgMember()/getMemberOrgId() instead").toEqual([]);
  });

  it("rule 2: every action / route that can reach the service client checks membership first", () => {
    const offenders: string[] = [];
    for (const m of userFacing) {
      if (m.isRoute && NO_MEMBER_ROUTES[m.rel]) continue;
      for (const fn of entryPoints(m)) {
        const key = `${m.rel}#${fn.name}`;
        if (NO_MEMBER_ACTIONS[key]) continue;
        const r = reach(m.rel, fn.name);
        if (r.service && !r.guard) offenders.push(key);
      }
    }
    expect(offenders, "call requireOrgMember() (or getMemberOrgId()) before any service-client access").toEqual([]);
  });

  it("rule 3: nothing else reads the org cookie and reaches the service client in one function", () => {
    const offenders: string[] = [];
    for (const m of mods.values()) {
      if (m.useServer || m.isRoute || m.rel === GUARD_FILE) continue;
      for (const fn of m.fns.values()) {
        if (facts(fn.body).readsCookie && reach(m.rel, fn.name).service) offenders.push(`${m.rel}#${fn.name}`);
      }
    }
    expect(offenders, "use getMemberOrgId() instead of the raw cookie here").toEqual([]);
  });

  it("the allow-lists name only files and functions that still exist and still need it", () => {
    const stale: string[] = [];
    for (const r of Object.keys(NO_MEMBER_ROUTES)) {
      const m = mods.get(r);
      if (!m) stale.push(`${r} (missing)`);
      else if (!entryPoints(m).some((fn) => reach(r, fn.name).service)) stale.push(`${r} (no service client)`);
    }
    for (const key of Object.keys(NO_MEMBER_ACTIONS)) {
      const [r, fn] = key.split("#");
      if (!mods.get(r)?.fns.get(fn)) stale.push(`${key} (missing)`);
      else if (!reach(r, fn).service) stale.push(`${key} (no service client)`);
    }
    for (const r of Object.keys(COOKIE_HINT_ONLY)) {
      const m = mods.get(r);
      if (!m) stale.push(`${r} (missing)`);
      // A cookie read is only harmless while nothing here can reach the service client.
      else if (entryPoints(m).some((fn) => reach(r, fn.name).service)) stale.push(`${r} (reaches the service client)`);
    }
    expect(stale).toEqual([]);
  });
});
