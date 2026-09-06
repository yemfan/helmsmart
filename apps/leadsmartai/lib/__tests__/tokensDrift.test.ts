import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RAMP_STEPS, brandOklch, neutralOklch, semantic } from "../../../../packages/tokens/src/index";

/**
 * globals.css carries the web palette as Tailwind theme variables; the
 * mobile app carries the same palette as hex in its theme. Both are meant to
 * be @leadsmart/tokens, and the mobile side now imports it. The web side
 * cannot import TypeScript into CSS, so this test is how it consumes the
 * package: every ramp step and every flat semantic colour in the CSS must be
 * the string the package says, verbatim.
 */
const CSS = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");

function themeVar(name: string): string | null {
  const m = CSS.match(new RegExp(`--${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
}

describe("web theme matches @leadsmart/tokens", () => {
  it("brand ramp", () => {
    for (const step of RAMP_STEPS) expect(themeVar(`color-brand-${step}`), `brand-${step}`).toBe(brandOklch[step]);
  });

  it("neutral ramp", () => {
    for (const step of RAMP_STEPS) expect(themeVar(`color-neutral-${step}`), `neutral-${step}`).toBe(neutralOklch[step]);
  });

  it("flat semantic colours", () => {
    expect(themeVar("color-brand-primary")).toBe(semantic.primary);
    expect(themeVar("color-blue-700")).toBe(semantic.primaryHover);
    expect(themeVar("color-brand-accent")).toBe(semantic.accent);
    expect(themeVar("color-brand-accent-text")).toBe(semantic.accentText);
    expect(themeVar("color-brand-success")).toBe(semantic.success);
    // The dark-mode flip of the text orange lives in the `.dark` block.
    expect(CSS).toContain(`--color-brand-accent-text: ${semantic.accentTextDark};`);
  });
});
