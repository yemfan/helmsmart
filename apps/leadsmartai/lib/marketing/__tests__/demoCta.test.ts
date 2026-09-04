import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A CTA that offers proof must deliver proof.
 *
 * The /features hero has two buttons. One asks for the sale ("Hire your AI
 * team"); the other offers evidence — "Hear it answer a call" — and it pointed
 * at /contact, a lead-capture form. So the single place on the page where a
 * sceptical agent could stop reading claims and actually hear the product
 * instead asked them to fill in their details and wait.
 *
 * /voice-ai-test-drive does exactly what the label says: it rings your phone
 * with the AI, no signup. It existed the whole time — linked from two blog
 * posts and nothing else.
 *
 * Nothing was broken in the usual sense. The link resolved, the page rendered,
 * no error anywhere. The label and the destination simply disagreed, which no
 * type checker or test suite can notice on its own.
 */

const ROOT = join(__dirname, "..", "..", "..");

const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/** Where a "hear it / call you" promise is allowed to lead. */
const DEMO_ROUTES = ["/voice-ai-test-drive", "tel:", "#request-callback"];

describe("demo CTAs", () => {
  it("sends the features hero's proof CTA to the live demo", () => {
    const src = read("app/features/page.tsx");
    // The label and the href sit in the same JSX element; assert the pairing
    // rather than merely that the route appears somewhere on the page.
    const block = src.match(/<Link[^>]*href="([^"]+)"[\s\S]{0,400}?hero\.cta_secondary/);
    expect(block, "features hero secondary CTA not found").toBeTruthy();
    expect(DEMO_ROUTES).toContain(block![1]);
  });

  it("keeps the live demo page reachable from the marketing site", () => {
    // It was orphaned to two blog posts. If the only inbound links are blog
    // posts again, the demo is effectively unreachable for a visitor who
    // arrives at the top of the funnel.
    const linkers = ["app/features/page.tsx"];
    for (const rel of linkers) {
      expect(read(rel), `${rel} should link the voice demo`).toContain("/voice-ai-test-drive");
    }
  });

  it("does not send a listen-to-it promise to a contact form", () => {
    // The specific regression: label promises audio, href opens a lead form.
    const src = read("app/features/page.tsx");
    const secondary = src.match(/<Link[^>]*href="([^"]+)"[\s\S]{0,400}?hero\.cta_secondary/);
    expect(secondary![1]).not.toBe("/contact");
  });
});
