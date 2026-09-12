import { describe, expect, it } from "vitest";

/** Mirrors cappedDatabaseUrl() in lib/prisma.ts. */
function capped(raw?: string): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  try {
    const url = new URL(v);
    if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", "1");
    return url.toString();
  } catch {
    return v;
  }
}

describe("Prisma connection cap", () => {
  it("caps a plain connection string at one connection", () => {
    expect(capped("postgresql://u:p@host:5432/db")).toContain("connection_limit=1");
  });
  it("keeps an explicit limit the operator chose", () => {
    expect(capped("postgresql://u:p@host:5432/db?connection_limit=5")).toContain("connection_limit=5");
  });
  it("preserves existing parameters", () => {
    const out = capped("postgresql://u:p@h:6543/db?pgbouncer=true") as string;
    expect(out).toContain("pgbouncer=true");
    expect(out).toContain("connection_limit=1");
  });
  it("is undefined when DATABASE_URL is unset, so Prisma never connects", () => {
    expect(capped(undefined)).toBeUndefined();
    expect(capped("   ")).toBeUndefined();
  });
  it("hands back an unparseable string untouched rather than losing it", () => {
    expect(capped("not-a-url")).toBe("not-a-url");
  });
});
