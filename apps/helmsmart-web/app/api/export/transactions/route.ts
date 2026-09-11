/**
 * GET /api/export/transactions
 *
 * Returns a CSV of all bank transactions for the authenticated org.
 * Query params:
 *   ?from=YYYY-MM-DD  (optional, default: 365 days before `to`'s default)
 *   ?to=YYYY-MM-DD    (optional, default: today in the org's timezone)
 *   ?reviewed=true|false (optional, filter by review status)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMemberOrgId } from "@/lib/auth/org-context";
import { orgToday } from "@/lib/org-timezone";
import { addDays } from "@/lib/org-date";

function csvEscape(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function row(...cols: (string | number | null | undefined)[]): string {
  return cols.map(csvEscape).join(",");
}

export async function GET(request: NextRequest) {
  const orgId = (await getMemberOrgId()) ?? "";
  if (!orgId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  // The defaults are the org's dates: the year up to its own today.
  const today   = await orgToday(orgId);
  const from    = searchParams.get("from") ?? addDays(today, -365);
  const to      = searchParams.get("to")  ?? today;
  const reviewed = searchParams.get("reviewed");

  const supabase = await createClient();

  let query = supabase
    .from("bank_transactions")
    .select(`
      date, merchant_name, name, amount, personal_finance_category,
      reviewed, pending,
      bank_accounts(name, mask)
    `)
    .eq("organization_id", orgId)
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: false });

  if (reviewed !== null) query = query.eq("reviewed", reviewed === "true");

  const { data: txns, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const lines = [
    row("Date", "Description", "Merchant", "Category", "Amount", "Bank Account", "Reviewed", "Pending"),
  ];

  for (const t of txns ?? []) {
    const bankRaw = t.bank_accounts;
    const bank = (Array.isArray(bankRaw) ? bankRaw[0] : bankRaw) as { name: string; mask: string | null } | null;
    const bankName = bank ? `${bank.name}${bank.mask ? ` ···${bank.mask}` : ""}` : "";

    // Plaid sign: positive = expense (money out), negative = income (money in)
    // Normalize to: expenses positive, income negative (conventional)
    lines.push(row(
      t.date,
      t.name,
      t.merchant_name ?? "",
      (t.personal_finance_category ?? "").replace(/_/g, " ").toLowerCase(),
      (-t.amount).toFixed(2),   // flip sign: now positive = income, negative = expense
      bankName,
      t.reviewed ? "yes" : "no",
      t.pending  ? "yes" : "no",
    ));
  }

  const csv = lines.join("\r\n");
  const filename = `transactions-${from}-to-${to}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
