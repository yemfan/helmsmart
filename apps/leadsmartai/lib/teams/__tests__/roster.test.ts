import { describe, expect, it } from "vitest";
import { MAX_ROSTER_ROWS, parseRoster } from "../roster";

describe("parseRoster", () => {
  it("reads a CSV export with a header row, first/last names and phones", () => {
    const r = parseRoster(
      [
        "First Name,Last Name,Email Address,Cell Phone,Office",
        "Grace,Lin,Grace.Lin@Example.com,(626) 555-2101,Alhambra",
        '"Reyes, Daniel",,daniel@example.com,626-555-2102,',
        "Priya,Natarajan,priya@example.com,,Arcadia",
      ].join("\n"),
    );
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([
      { email: "grace.lin@example.com", name: "Grace Lin", phone: "+16265552101" },
      { email: "daniel@example.com", name: "Reyes, Daniel", phone: "+16265552102" },
      { email: "priya@example.com", name: "Priya Natarajan", phone: null },
    ]);
  });

  it("reads a tab-separated paste from a spreadsheet with a single name column", () => {
    const r = parseRoster("Name\tEmail\tPhone\nKevin Chao\tkevin@example.com\t6265552106\nHannah Kim\thannah@example.com\t");
    expect(r.rows.map((x) => x.name)).toEqual(["Kevin Chao", "Hannah Kim"]);
    expect(r.rows[0]!.phone).toBe("+16265552106");
  });

  it("takes a bare column of emails, address-book lines, and rows without a header", () => {
    const r = parseRoster(["marcus@example.com", "Elena Petrova <elena@example.com>", "Tyler Brooks, tyler@example.com, 626 555 2110"].join("\n"));
    expect(r.rows).toEqual([
      { email: "marcus@example.com", name: null, phone: null },
      { email: "elena@example.com", name: "Elena Petrova", phone: null },
      { email: "tyler@example.com", name: "Tyler Brooks", phone: "+16265552110" },
    ]);
  });

  it("names every line it could not use, and why", () => {
    const r = parseRoster(["Email", "good@example.com", "no email on this line", "bad@", "GOOD@example.com"].join("\n"));
    expect(r.rows).toHaveLength(1);
    expect(r.problems).toEqual([
      { line: 3, text: "no email on this line", reason: "no_email" },
      { line: 4, text: "bad@", reason: "bad_email" },
      { line: 5, text: "GOOD@example.com", reason: "duplicate" },
    ]);
  });

  it("stops at the row cap and is empty for blank input", () => {
    const many = Array.from({ length: MAX_ROSTER_ROWS + 5 }, (_, i) => `a${i}@example.com`).join("\n");
    expect(parseRoster(many).rows).toHaveLength(MAX_ROSTER_ROWS);
    expect(parseRoster("  \n\n")).toEqual({ rows: [], problems: [] });
  });
});

describe("parseRoster with a Lofty agent export", () => {
  it("reads Lofty's user columns as they ship (First Name, Last Name, Email, Phone, Group, Permission Profile)", () => {
    const lofty = [
      "First Name,Last Name,Email,Phone,Group,Permission Profile",
      "Jason,Oliver,jason@example.com,6509849102,Company Name/First-tier Group name,Company Admin",
      "Lucky,Chuck,lucky@example.com,6509949120,Company Name/First-tier Group name,Group Owner",
      "Kevin,Leon,kevin@example.com,6509949121,Company Name/Second-tier Group name,Standard User",
    ].join("\n");
    const r = parseRoster(lofty);
    expect(r.problems).toEqual([]);
    expect(r.rows).toEqual([
      { email: "jason@example.com", name: "Jason Oliver", phone: "+16509849102" },
      { email: "lucky@example.com", name: "Lucky Chuck", phone: "+16509949120" },
      { email: "kevin@example.com", name: "Kevin Leon", phone: "+16509949121" },
    ]);
  });
});
