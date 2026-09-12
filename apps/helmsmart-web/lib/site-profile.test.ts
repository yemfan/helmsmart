import { describe, expect, it } from "vitest";

import { htmlToText, htmlTitle, isBlockedHostname, isPrivateAddress, normalizeSiteUrl } from "@/lib/site-profile";

/**
 * The guard on the one place this app fetches a URL a user supplied.
 *
 * `readSiteText` opens a socket to whatever a stranger typed in the sign-up
 * form, which is the shape of every server-side request forgery: point it at
 * `169.254.169.254` and it reads cloud credentials, at `127.0.0.1:54322` and it
 * reads the local database. The address checks are the whole defence, they are
 * pure functions, and nothing else in the repo tests them — so they are tested
 * here rather than trusted.
 *
 * The network walk itself is not exercised: it would need a live server, and
 * every decision it makes that matters is one of these functions.
 */

describe("normalizeSiteUrl", () => {
  it("adds https to a bare domain, because that is what people type", () => {
    expect(normalizeSiteUrl("acme.com")?.toString()).toBe("https://acme.com/");
    expect(normalizeSiteUrl("  www.acme.com/services  ")?.toString()).toBe("https://www.acme.com/services");
  });

  it("refuses http rather than silently upgrading it", () => {
    // Rewriting someone's scheme to one that happens to pass the guard is how
    // a guard stops meaning anything.
    expect(normalizeSiteUrl("http://acme.com")).toBeNull();
  });

  it("refuses every scheme that is not https", () => {
    for (const bad of ["file:///etc/passwd", "ftp://acme.com", "data:text/html,<b>x", "javascript:alert(1)"]) {
      expect(normalizeSiteUrl(bad), bad).toBeNull();
    }
  });

  it("refuses nothing at all", () => {
    expect(normalizeSiteUrl("")).toBeNull();
    expect(normalizeSiteUrl("   ")).toBeNull();
    expect(normalizeSiteUrl("https://")).toBeNull();
  });
});

describe("isBlockedHostname", () => {
  it("blocks the names that only ever resolve inside a network", () => {
    for (const host of [
      "localhost",
      "app.localhost",
      "db.local",
      "metadata.internal",
      "printer.home.arpa",
      "intranet",
      "",
    ]) {
      expect(isBlockedHostname(host), host).toBe(true);
    }
  });

  it("blocks a private address written straight into the host", () => {
    expect(isBlockedHostname("127.0.0.1")).toBe(true);
    expect(isBlockedHostname("169.254.169.254")).toBe(true);
    expect(isBlockedHostname("[::1]")).toBe(true);
  });

  it("allows an ordinary public hostname", () => {
    expect(isBlockedHostname("acme.com")).toBe(false);
    expect(isBlockedHostname("www.helmsmart.ai")).toBe(false);
    // A trailing dot is the same name.
    expect(isBlockedHostname("acme.com.")).toBe(false);
  });
});

describe("isPrivateAddress", () => {
  it("rejects loopback, RFC1918, CGNAT and link-local", () => {
    for (const ip of [
      "127.0.0.1",
      "127.1.1.1",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // the cloud metadata endpoint this exists for
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it("accepts ordinary public addresses, including 172.32 just outside RFC1918", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.0.1", "93.184.216.34"]) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it("sees through IPv4-mapped IPv6, which is the obvious way round a v4-only check", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("fd00::1")).toBe(true); // unique local
    expect(isPrivateAddress("fe80::1")).toBe(true); // link-local
    expect(isPrivateAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("refuses anything that is not an address at all", () => {
    // Fails closed: a value we cannot reason about is not a value we connect to.
    expect(isPrivateAddress("not-an-ip")).toBe(true);
    expect(isPrivateAddress("")).toBe(true);
  });
});

describe("htmlToText", () => {
  it("drops scripts and styles rather than feeding them to the model", () => {
    const text = htmlToText(
      `<html><head><style>.a{color:red}</style></head><body><script>alert('x')</script><h1>Acme Plumbing</h1><p>Drain cleaning</p></body></html>`,
    );
    expect(text).toContain("Acme Plumbing");
    expect(text).toContain("Drain cleaning");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("color:red");
  });

  it("keeps block boundaries so sentences do not run together", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\nTwo");
  });

  it("decodes the entities that actually show up in copy", () => {
    expect(htmlToText("<p>Bob &amp; Sons&nbsp;&mdash; 24/7</p>")).toContain("Bob & Sons");
  });

  it("survives an unclosed tag without throwing", () => {
    expect(() => htmlToText("<div><p>hello")).not.toThrow();
  });
});

describe("htmlTitle", () => {
  it("finds the title when there is one", () => {
    expect(htmlTitle("<html><head><title>Acme Plumbing | Austin</title></head></html>")).toBe(
      "Acme Plumbing | Austin",
    );
  });

  it("is null when there isn't", () => {
    expect(htmlTitle("<html><body>hi</body></html>")).toBeNull();
    expect(htmlTitle("<title>   </title>")).toBeNull();
  });
});
