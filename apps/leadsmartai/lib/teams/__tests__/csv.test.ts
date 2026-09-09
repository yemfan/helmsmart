import { describe, expect, it } from "vitest";
import { toCsv } from "../csv";

describe("toCsv", () => {
  it("quotes what needs quoting, keeps numbers bare, and starts with a BOM", () => {
    const out = toCsv(["Agent", "Note", "Leads"], [["李雷", 'said "hi", left', 3], ["Ann", null, 0]]);
    expect(out).toBe('﻿Agent,Note,Leads\r\n李雷,"said ""hi"", left",3\r\nAnn,,0\r\n');
  });

  it("defuses a cell that would run as a spreadsheet formula", () => {
    expect(toCsv(["x"], [["=SUM(A1)"], ["+1"], ["-2"], ["@cmd"]])).toBe("﻿x\r\n'=SUM(A1)\r\n'+1\r\n'-2\r\n'@cmd\r\n");
  });
});
