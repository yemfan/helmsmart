import { describe, expect, it } from "vitest";

import { parseInline, safeHref } from "./inline";

/**
 * Both failures here were seen in production, in the same reply.
 *
 * A realtor asked Max where their timezone setting lives. Max answered with a
 * markdown link, which reached the screen as the literal string
 * "[Settings → Account](https://closeboss.com/…)" because the renderer only
 * knew about **bold** — and the href it had composed pointed at a hostname it
 * invented from the brand name, which belongs to someone else.
 */

describe("safeHref", () => {
  it("accepts an in-app path", () => {
    expect(safeHref("/dashboard/settings/account")).toBe("/dashboard/settings/account");
  });

  it("rejects an absolute URL, however plausible the host", () => {
    // The point is not that closeboss.com is hostile — it is that the model
    // has no way to know what this deployment is served from, so any host it
    // writes is a guess.
    expect(safeHref("https://closeboss.com/dashboard/settings/account")).toBeNull();
    expect(safeHref("https://www.closebossai.com/dashboard/settings/account")).toBeNull();
  });

  it("rejects script and data URLs", () => {
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("JavaScript:alert(1)")).toBeNull();
    expect(safeHref("data:text/html,<script>")).toBeNull();
  });

  it("rejects a protocol-relative URL that only looks like a path", () => {
    expect(safeHref("//evil.example/dashboard")).toBeNull();
  });
});

describe("parseInline", () => {
  it("turns an in-app markdown link into a link piece", () => {
    expect(parseInline("Go to [Settings → Account](/dashboard/settings/account) to change it.")).toEqual([
      { kind: "text", text: "Go to " },
      { kind: "link", text: "Settings → Account", href: "/dashboard/settings/account" },
      { kind: "text", text: " to change it." },
    ]);
  });

  it("keeps a rejected link as its original markdown", () => {
    const pieces = parseInline("[Settings → Account](https://closeboss.com/dashboard/settings/account)");
    expect(pieces).toEqual([
      { kind: "text", text: "[Settings → Account](https://closeboss.com/dashboard/settings/account)" },
    ]);
  });

  it("still finds bold, on its own and around a link", () => {
    expect(parseInline("**Timezone:** Pacific")).toEqual([
      { kind: "bold", text: "Timezone:" },
      { kind: "text", text: " Pacific" },
    ]);
    expect(parseInline("**A** [b](/c) **d**")).toEqual([
      { kind: "bold", text: "A" },
      { kind: "text", text: " " },
      { kind: "link", text: "b", href: "/c" },
      { kind: "text", text: " " },
      { kind: "bold", text: "d" },
    ]);
  });

  it("leaves a plain line alone", () => {
    expect(parseInline("no markup here")).toEqual([{ kind: "text", text: "no markup here" }]);
  });

  it("handles several links on one line", () => {
    const pieces = parseInline("[a](/a) and [b](/b)");
    expect(pieces.filter((p) => p.kind === "link")).toHaveLength(2);
  });
});
