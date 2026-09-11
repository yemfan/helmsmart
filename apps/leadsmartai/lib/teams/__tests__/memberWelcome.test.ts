import { describe, expect, it } from "vitest";
import { memberWelcomeEmail } from "../memberWelcome";

const base = { first: "Peter", teamName: "Pinnacle Real Estate Group", role: "member" as const, needsLicense: false, ownerName: "Michael Ye", origin: "https://www.closebossai.com" };

describe("memberWelcomeEmail", () => {
  it("names the team, links to the team page, and says who a reply reaches", () => {
    const m = memberWelcomeEmail(base);
    expect(m.subject).toBe("You're on Pinnacle Real Estate Group on CloseBoss");
    expect(m.text).toContain("Hi Peter,");
    expect(m.text).toContain("You've been added to Pinnacle Real Estate Group on CloseBoss.");
    expect(m.text).toContain("Open your team: https://www.closebossai.com/dashboard/team");
    expect(m.text).toContain("it goes to Michael Ye.");
    expect(m.text).not.toContain("/dashboard/team/license");
    expect(m.html).toContain('href="https://www.closebossai.com/dashboard/team"');
  });

  it("asks for the license only when none is on file", () => {
    const m = memberWelcomeEmail({ ...base, needsLicense: true });
    expect(m.text).toContain("Pinnacle Real Estate Group needs your real estate license on file.");
    expect(m.text).toContain("Add your license: https://www.closebossai.com/dashboard/team/license");
    expect(m.html).toContain("Add your license");
  });

  it("tells a manager what they can do, greets plainly without a name, and escapes html", () => {
    const m = memberWelcomeEmail({ ...base, first: null, role: "manager", ownerName: null, teamName: "A & B <Realty>" });
    expect(m.text.startsWith("Hi,\n")).toBe(true);
    expect(m.text).toContain("You're a manager");
    expect(m.text).toContain("Questions? Reply to this email.");
    expect(m.html).toContain("A &amp; B &lt;Realty&gt;");
    expect(m.html).not.toContain("<Realty>");
  });
});
