import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A disabled button has to say why.
 *
 * "Create listing" sits behind `!contact?.id || !propertyAddress.trim()`. A
 * seller TYPED into the picker but never chosen from the list leaves the field
 * reading `Yeangel996@gmail.com` and the id null — so the form looked complete,
 * the button was faded, and nothing on screen said which of the two
 * requirements was unmet or that a list item had to be clicked.
 *
 * The hint is generated from the same two conditions rather than a hand-written
 * copy of them, because the failure mode this guards against is not the hint
 * being absent — it is the hint and the button disagreeing after someone adds a
 * third requirement to one and not the other.
 */
const ROOT = join(__dirname, "..", "..", "..");
const SRC = "app/dashboard/transactions/new/NewTransactionClient.tsx";

const src = readFileSync(join(ROOT, SRC), "utf8");

describe("new transaction: why the button is disabled", () => {
  it("still gates on a real contact and an address", () => {
    // The premise. If these stop gating submission, the hint is dead code.
    expect(src).toMatch(/disabled=\{submitting \|\| !contact\?\.id \|\| !propertyAddress\.trim\(\)\}/);
  });

  it("names every condition the button gates on", () => {
    const start = src.indexOf("const blockers = [");
    expect(start, "blockers list not found").toBeGreaterThan(-1);
    const blockers = src.slice(start, src.indexOf(".filter(Boolean) as string[]", start));
    expect(blockers).toContain("!contact?.id");
    expect(blockers).toContain("!propertyAddress.trim()");
  });

  it("tells the agent to pick from the list, not merely that a seller is needed", () => {
    /*
     * The whole trap is that typing looks like choosing. "Seller is required"
     * would have been useless here — the field had a seller in it.
     */
    const dict = JSON.parse(
      readFileSync(join(ROOT, "..", "..", "packages", "i18n", "locales", "en", "dashboard.json"), "utf8"),
    ).pages.newTransaction;
    expect(dict.needSeller).toMatch(/from the list/i);
    expect(dict.needBuyer).toMatch(/from the list/i);
    expect(dict.beforeCreating).toContain("{{items}}");
  });

  it("is translated, like the rest of the form", () => {
    const zh = JSON.parse(
      readFileSync(join(ROOT, "..", "..", "packages", "i18n", "locales", "zh-Hans", "dashboard.json"), "utf8"),
    ).pages.newTransaction;
    for (const key of ["beforeCreating", "needSeller", "needBuyer", "needAddress"]) {
      expect(zh[key], `zh-Hans missing ${key}`).toBeTruthy();
    }
    // Hardcoded English here would be the same bug #1538 spent a PR removing.
    expect(src).not.toMatch(/Before creating:/);
  });
});
