import { describe, expect, it } from "vitest";
import { brokerageLine, checkLicenseFormat, ensureBrokerageLine, hasPublicRecord, licenseLabel, normalizeLicenseNumber, statusFromLookup } from "../license";

describe("normalizeLicenseNumber", () => {
  it("strips the label, the hash and spaces, and upper-cases", () => {
    expect(normalizeLicenseNumber(" DRE # 0123 4567 ")).toBe("01234567");
    expect(normalizeLicenseNumber("lic. rs312345")).toBe("RS312345");
    expect(normalizeLicenseNumber("#S.0123456")).toBe("S.0123456");
  });
});

describe("checkLicenseFormat", () => {
  it("knows the shape per state and falls back to a loose one elsewhere", () => {
    expect(checkLicenseFormat("ca", "01234567")).toEqual({ ok: true, number: "01234567", state: "CA" });
    expect(checkLicenseFormat("CA", "1234567")).toEqual({ ok: false, reason: "format" });
    expect(checkLicenseFormat("FL", "sl3123456")).toEqual({ ok: true, number: "SL3123456", state: "FL" });
    expect(checkLicenseFormat("WY", "RE-12345")).toEqual({ ok: true, number: "RE-12345", state: "WY" });
    expect(checkLicenseFormat("CA", "(626) 555-2101")).toEqual({ ok: false, reason: "format" });
  });

  it("needs a real state and a number", () => {
    expect(checkLicenseFormat("", "01234567")).toEqual({ ok: false, reason: "state" });
    expect(checkLicenseFormat("XX", "01234567")).toEqual({ ok: false, reason: "state" });
    expect(checkLicenseFormat("CA", "  ")).toEqual({ ok: false, reason: "empty" });
  });
});

describe("statusFromLookup", () => {
  it("confirms a current record, names the rest, and leaves a failed fetch alone", () => {
    expect(statusFromLookup("found", { active: true })).toBe("verified");
    expect(statusFromLookup("found", { active: false })).toBe("inactive");
    expect(statusFromLookup("not_found")).toBe("not_found");
    expect(statusFromLookup("unsupported")).toBe("unavailable");
    expect(statusFromLookup("error")).toBeNull();
  });
});

describe("brokerage line", () => {
  it("composes what the ad must carry and appends it once", () => {
    const line = brokerageLine({ brandName: "MAXY Realty Group", brandLicense: "DRE #02123456", agentName: "Michael Ye", agentLicense: { number: "01234567", state: "CA" } });
    expect(line).toBe("MAXY Realty Group · DRE #02123456 · Michael Ye, DRE #01234567");
    expect(ensureBrokerageLine("Just listed!", line, "MAXY Realty Group")).toBe(`Just listed!\n\n${line}`);
    expect(ensureBrokerageLine("Just listed by MAXY Realty Group", line, "MAXY Realty Group")).toBe("Just listed by MAXY Realty Group");
    expect(ensureBrokerageLine(`x\n\n${line}`, line, null)).toBe(`x\n\n${line}`);
  });

  it("says nothing when there is nothing required", () => {
    expect(brokerageLine({ brandName: null, brandLicense: null, agentName: "A", agentLicense: null })).toBeNull();
    expect(ensureBrokerageLine("hello", null, null)).toBe("hello");
    expect(brokerageLine({ brandName: null, brandLicense: null, agentName: null, agentLicense: { number: "0612345", state: "TX" } })).toBe("TREC #0612345");
  });

  it("labels by state and knows which states publish a record", () => {
    expect(licenseLabel("CA")).toBe("DRE #");
    expect(licenseLabel("ND")).toBe("Lic. #");
    expect(hasPublicRecord("CA")).toBe(true);
    expect(hasPublicRecord("NY")).toBe(false);
  });
});
