/**
 * `messages.sent_by` is only as good as two promises: the database accepts
 * exactly the values the code writes, and every outbound row is written by the
 * one path that sets it. Both are checked here from the source, so a new send
 * that bypasses `lib/outbound-send.ts` fails the suite rather than landing an
 * unlabelled row — or a text nobody checked consent for.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGE_SENDERS } from "./message-provenance";

const ROOT = join(__dirname, "..");
const MIGRATION = join(ROOT, "supabase", "migrations", "20260912000000_messages_sent_by.sql");
const CHOKE_POINT = "lib/outbound-send.ts";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name !== "node_modules" && name !== "__tests__") walk(p, out);
    } else if ((p.endsWith(".ts") || p.endsWith(".tsx")) && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/**
 * Blank out comments, keeping every newline so line numbers still point at the
 * code. A doc comment that shows how to call Twilio is not a call to Twilio.
 */
function stripComments(src: string): string {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
}

const sources = () =>
  ["app", "components", "lib"].flatMap((d) => walk(join(ROOT, d))).map((file) => ({
    rel: relative(ROOT, file).split(sep).join("/"),
    src: stripComments(readFileSync(file, "utf8")),
  }));

describe("messages.sent_by", () => {
  it("the migration's CHECK allows exactly MESSAGE_SENDERS", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const check = sql.match(/sent_by in \(([^)]*)\)/);
    expect(check, "no CHECK list found in the migration").not.toBeNull();
    const allowed = [...check![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(allowed.sort()).toEqual([...MESSAGE_SENDERS].sort());
  });

  it("only the shared send path writes outbound messages rows", () => {
    const findings: string[] = [];
    for (const { rel, src } of sources()) {
      if (rel === CHOKE_POINT) continue;
      for (const m of src.matchAll(/from\("messages"\)\s*\.insert\(/g)) {
        const window = src.slice(m.index, (m.index ?? 0) + 600);
        if (/direction:\s*"outbound"/.test(window)) {
          findings.push(`${rel}:${src.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    expect(findings, `outbound messages rows written outside ${CHOKE_POINT}`).toEqual([]);
  });

  it("only the shared send path calls Twilio to send a text", () => {
    const findings: string[] = [];
    for (const { rel, src } of sources()) {
      if (rel === CHOKE_POINT) continue;
      // Anthropic's client is also `.messages.create`; Twilio's is the one
      // handed `to:` and `body:` alongside a sender spread.
      for (const m of src.matchAll(/\.messages\.create\(\s*\{[^}]*\bto\b[^}]*\bbody\b/g)) {
        findings.push(`${rel}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(findings, `Twilio sends outside ${CHOKE_POINT}`).toEqual([]);
  });
});
