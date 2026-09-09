/**
 * POST /api/books/expenses/import
 *
 * Accepts a JSON body with array of expense rows from CSV import.
 * Each row has: date, amount, description, category (optional)
 *
 * For each row:
 * - Validate date (YYYY-MM-DD) and amount (positive number)
 * - Look up CoA account by category hint (case-insensitive partial match)
 * - Create journal entry using recordExpense from @helm/dna-finance
 *
 * Returns { inserted: number, failed: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { recordExpense } from "@helm/dna-finance";
import { revalidatePath } from "next/cache";
import { getServerT } from "@/lib/i18n/server";

// Map AI category → CoA account name fragment (case-insensitive partial match).
// Lookup data on both sides — the keys are the category enum and the hints
// are matched against account names — so this stays English in every locale.
const CATEGORY_HINTS: Record<string, string[]> = {
  "Advertising & Marketing": ["advertising", "marketing"],
  "Bank Fees":               ["bank fee", "bank charge"],
  "Computer & Software":    ["computer", "software", "tech"],
  "Dues & Subscriptions":   ["subscription", "dues", "membership"],
  "Equipment":              ["equipment", "machinery"],
  "Insurance":              ["insurance"],
  "Meals & Entertainment":  ["meals", "entertainment", "food"],
  "Office Supplies":        ["office"],
  "Professional Services":  ["professional", "consulting", "legal", "accounting"],
  "Rent & Utilities":       ["rent", "utilities", "utility"],
  "Repairs & Maintenance":  ["repairs", "maintenance"],
  "Shipping & Delivery":    ["shipping", "freight", "delivery"],
  "Travel":                 ["travel"],
  "Vehicle":                ["vehicle", "auto", "car", "fuel"],
};

async function findBestAccount(category: string | null, supabase: Awaited<ReturnType<typeof createClient>>, orgId: string): Promise<string | null> {
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("type", "expense")
    .limit(100);

  if (!accounts || accounts.length === 0) return null;

  if (!category) return accounts[0]?.id ?? null;

  const hints = CATEGORY_HINTS[category] ?? [];
  for (const hint of hints) {
    const match = accounts.find((a) => (a.name as string).toLowerCase().includes(hint));
    if (match) return match.id;
  }
  return accounts[0]?.id ?? null;
}

interface ImportRow {
  date: string;
  amount: string;
  description: string;
  category?: string;
}

export async function POST(request: NextRequest) {
  const t = await getServerT("books");
  try {
    const cookieStore = await cookies();
    const orgId = cookieStore.get("helmsmart-org-id")?.value;
    if (!orgId) {
      return NextResponse.json({ error: t("errors.unauthorized", { ns: "common" }) }, { status: 401 });
    }

    const body = await request.json();
    const rows = (body.rows ?? []) as ImportRow[];

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: t("expenses.import.noRows") }, { status: 400 });
    }

    const supabase = await createClient();
    const serviceDb = await createServiceClient();

    let inserted = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const date = row.date?.trim();
        const amountStr = row.amount?.trim();
        const description = row.description?.trim();
        const category = row.category?.trim();

        // Validate date
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          failed++;
          continue;
        }

        // Validate amount
        const amount = parseFloat(amountStr ?? "");
        if (isNaN(amount) || amount <= 0) {
          failed++;
          continue;
        }

        // Validate description
        if (!description) {
          failed++;
          continue;
        }

        // Find best CoA account
        const expenseAccountId = await findBestAccount(category ?? null, supabase, orgId);
        if (!expenseAccountId) {
          failed++;
          continue;
        }

        // Record the expense (posts journal entry via @helm/dna-finance)
        await recordExpense(serviceDb, orgId, {
          date,
          amount,
          description,
          expenseAccountId,
          paymentSourceId: null, // Default to Accounts Payable
          projectId: null,
        });

        inserted++;
      } catch (err) {
        console.error("[expenses-import] Row error:", err);
        failed++;
      }
    }

    // Revalidate the expenses page
    revalidatePath("/books/expenses");
    revalidatePath("/books/journal");
    revalidatePath("/books/reports");
    revalidatePath("/reports");

    return NextResponse.json({ inserted, failed });
  } catch (err) {
    console.error("[expenses-import] Endpoint error:", err);
    const msg = err instanceof Error ? err.message : t("expenses.import.failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
