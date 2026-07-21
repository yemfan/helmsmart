import { describe, expect, it } from "vitest";
import { renderAlertEmail, renderAlertSms, type AlertInput } from "../renderAlert";

function input(overrides: Partial<AlertInput> = {}): AlertInput {
  return {
    offerKind: "buyer",
    alertLevel: "warning",
    propertyAddress: "500 Sutter St",
    counterpartyLabel: "Jane Buyer",
    offerPrice: 1_200_000,
    expiresAtIso: "2026-05-15T17:00:00Z",
    hoursUntilExpiration: 24,
    appBaseUrl: "https://www.closebossai.com",
    offerUrl: "/dashboard/offers/abc",
    ...overrides,
  };
}

describe("renderAlertEmail", () => {
  it("warning subject includes the property address but not 'final'", () => {
    const out = renderAlertEmail(input());
    expect(out.subject).not.toMatch(/final/i);
    expect(out.subject).toContain("500 Sutter St");
  });

  it("final alert subject prefixes with ⚠️ and shows hours", () => {
    const out = renderAlertEmail(
      input({ alertLevel: "final", hoursUntilExpiration: 2 }),
    );
    expect(out.subject).toMatch(/Final alert/);
    expect(out.subject).toContain("2h");
  });

  it("buyer-side perspective copy references 'your buyer'", () => {
    const out = renderAlertEmail(input({ offerKind: "buyer" }));
    expect(out.text).toMatch(/your buyer/i);
  });

  it("listing-side perspective copy references incoming offer", () => {
    const out = renderAlertEmail(input({ offerKind: "listing" }));
    expect(out.text).toMatch(/incoming offer/i);
  });

  it("formats offer price with currency + thousands separators", () => {
    const out = renderAlertEmail(input({ offerPrice: 1_275_000 }));
    expect(out.html).toContain("$1,275,000");
    expect(out.text).toContain("$1,275,000");
  });

  it("absolutizes relative offer URLs against appBaseUrl", () => {
    const out = renderAlertEmail(input({ offerUrl: "/dashboard/offers/xyz" }));
    expect(out.html).toContain("https://www.closebossai.com/dashboard/offers/xyz");
  });

  it("escapes HTML in property address + counterparty", () => {
    const out = renderAlertEmail(
      input({
        propertyAddress: "<b>bad</b> St",
        counterpartyLabel: "Tom & Jane",
      }),
    );
    expect(out.html).not.toContain("<b>bad</b>");
    expect(out.html).toContain("&lt;b&gt;");
    expect(out.html).toContain("Tom &amp; Jane");
  });

  it("hides counterparty detail row when label is null", () => {
    // The headline + perspective copy also mention "your buyer" / "offeror"
    // on principle; we only want to confirm the DETAIL ROW is absent.
    // The detail row renders as "<dt>Your buyer</dt>" or "<dt>Offeror</dt>".
    const out = renderAlertEmail(input({ counterpartyLabel: null }));
    expect(out.html).not.toMatch(/<dt[^>]*>Your buyer<\/dt>/);
    expect(out.html).not.toMatch(/<dt[^>]*>Offeror<\/dt>/);
  });
});

describe("renderAlertSms", () => {
  it("warning SMS does not start with 'FINAL'", () => {
    const sms = renderAlertSms(input({ alertLevel: "warning" }));
    expect(sms).not.toMatch(/FINAL ALERT/);
    expect(sms).toContain("⏰");
  });

  it("final SMS starts with FINAL ALERT and shows hours", () => {
    const sms = renderAlertSms(
      input({ alertLevel: "final", hoursUntilExpiration: 2 }),
    );
    expect(sms).toMatch(/FINAL ALERT/);
    expect(sms).toContain("2h");
  });

  it("clamps hours to min 1 (so we never say 'in 0h')", () => {
    const sms = renderAlertSms(input({ hoursUntilExpiration: 0.3 }));
    expect(sms).toContain("1h");
  });

  it("buyer-side SMS says 'your buyer'; listing-side says 'the incoming offer'", () => {
    expect(renderAlertSms(input({ offerKind: "buyer" }))).toMatch(/your buyer/i);
    expect(renderAlertSms(input({ offerKind: "listing" }))).toMatch(/incoming offer/i);
  });
});
