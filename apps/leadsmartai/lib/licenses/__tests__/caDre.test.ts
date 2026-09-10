import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dreDate, dreDisplayName, parseDrePage } from "../ca-dre";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseDrePage", () => {
  it("reads a licensed salesperson with a responsible broker", () => {
    const r = parseDrePage(fixture("salesperson-licensed.html"));
    expect(r).not.toBeNull();
    expect(r!.licenseId).toBe("02180000");
    expect(r!.licenseType).toBe("SALESPERSON");
    expect(r!.nameRaw).toBe("Sample, Alex Jordan");
    expect(r!.displayName).toBe("Alex Jordan Sample");
    expect(r!.statusRaw).toBe("LICENSED");
    expect(r!.active).toBe(true);
    expect(r!.issuedOn).toBe("2024-02-27");
    expect(r!.responsibleBroker).toEqual({ licenseId: "01878277", name: "Example Realty of California, Inc.", address: "200 BROKER WAY, SAMPLETOWN, CA 90000" });
    expect(r!.discipline).toBeNull();
    expect(r!.mailingAddress).toBe("100 MAIN ST, SAMPLETOWN, CA 90000");
  });

  it("reads an expired salesperson with no broker", () => {
    const r = parseDrePage(fixture("salesperson-expired.html"))!;
    expect(r.licenseId).toBe("01234567");
    expect(r.displayName).toBe("Pat Sample");
    expect(r.statusRaw).toBe("EXPIRED");
    expect(r.active).toBe(false);
    expect(r.expiresOn).toBe("2014-02-18");
    expect(r.issuedOn).toBe("1998-02-19");
    expect(r.responsibleBroker).toBeNull();
  });

  it("reads a corporation with its main office", () => {
    const r = parseDrePage(fixture("corporation.html"))!;
    expect(r.licenseType).toBe("CORPORATION");
    expect(r.displayName).toBe("Sample Brokerage, Inc.");
    expect(r.active).toBe(true);
    expect(r.expiresOn).toBe("2027-10-07");
    expect(r.mainOffice).toBe("300 CORP PLAZA, SAMPLETOWN, CA 90000");
    expect(r.responsibleBroker).toBeNull();
  });

  it("returns null for the generic page an unknown id gets", () => {
    expect(parseDrePage(fixture("not-found.html"))).toBeNull();
    expect(parseDrePage("")).toBeNull();
  });
});

describe("dreDate", () => {
  it("expands two-digit years the way DRE means them", () => {
    expect(dreDate("02/18/14")).toBe("2014-02-18");
    expect(dreDate("10/07/27")).toBe("2027-10-07");
    expect(dreDate("06/06/98")).toBe("1998-06-06");
    expect(dreDate("11/21/2019")).toBe("2019-11-21");
    expect(dreDate("nope")).toBeNull();
  });
});

describe("dreDisplayName", () => {
  it("turns Last, First into First Last and leaves entities alone", () => {
    expect(dreDisplayName("Ye, Michael")).toBe("Michael Ye");
    expect(dreDisplayName("Sample, Alex Jordan ")).toBe("Alex Jordan Sample");
    expect(dreDisplayName("Compass California, Inc.")).toBe("Compass California, Inc.");
    expect(dreDisplayName("MAXY REALTY GROUP")).toBe("MAXY REALTY GROUP");
  });
});
