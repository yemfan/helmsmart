/**
 * POST /api/books/expenses/import-ofx
 *
 * Accepts a JSON body with array of transaction rows parsed from OFX/QFX.
 * Each row has: date, amount, description, memo, type (debit|credit)
 *
 * For each row:
 * - Validate date (YYYY-MM-DD) and amount (positive number)
 * - Extract category hints from description/memo
 * - Look up CoA account by category hint (case-insensitive partial match)
 * - Create journal entry using recordExpense from @helm/dna-finance
 *
 * Returns { inserted: number, failed: number, skipped: number }
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
  "Advertising & Marketing": ["advertising", "marketing", "ad", "facebook", "google ads"],
  "Bank Fees":               ["bank fee", "bank charge", "atm", "overdraft"],
  "Computer & Software":    ["computer", "software", "tech", "microsoft", "adobe", "amazon"],
  "Dues & Subscriptions":   ["subscription", "dues", "membership", "netflix", "spotify", "saas"],
  "Equipment":              ["equipment", "machinery", "tools"],
  "Insurance":              ["insurance"],
  "Meals & Entertainment":  ["meals", "entertainment", "food", "restaurant", "coffee", "lunch", "dinner", "starbucks"],
  "Office Supplies":        ["office", "supplies", "staples", "paper", "pen"],
  "Professional Services":  ["professional", "consulting", "legal", "accounting", "lawyer", "accountant"],
  "Rent & Utilities":       ["rent", "utilities", "utility", "electric", "water", "gas"],
  "Repairs & Maintenance":  ["repairs", "maintenance", "fix", "plumber"],
  "Shipping & Delivery":    ["shipping", "freight", "delivery", "fedex", "ups"],
  "Travel":                 ["travel", "hotel", "airline", "uber", "lyft", "airbnb"],
  "Vehicle":                ["vehicle", "auto", "car", "fuel", "gas", "parking", "toll"],
};

function extractCategoryFromDescription(description: string): string | null {
  const lower = description.toLowerCase();
  for (const [category, hints] of Object.entries(CATEGORY_HINTS)) {
    for (const hint of hints) {
      if (lower.includes(hint)) {
        return category;
      }
    }
  }
  return null;
}

async function findBestAccount(description: string, supabase: Awaited<ReturnType<typeof createClient>>, orgId: string): Promise<string | null> {
  const { data: accounts } = await supabase
    .from("chart_of_accounts")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("type", "expense")
    .limit(100);

  if (!accounts || accounts.length === 0) return null;

  // Try to match category from description
  const category = extractCategoryFromDescription(description);
  if (category) {
    const hints = CATEGORY_HINTS[category] ?? [];
    for (const hint of hints) {
      const match = accounts.find((a) => (a.name as string).toLowerCase().includes(hint));
      if (match) return match.id;
    }
  }

  // Fallback to first expense account
  return accounts[0]?.id ?? null;
}

interface ImportRow {
  date: string;
  amount: string;
  description: string;
  memo?: string;
  type?: "debit" | "credit";
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
    let skipped = 0;

    for (const row of rows) {
      try {
        const date = row.date?.trim();
        const amountStr = row.amount?.trim();
        const description = row.description?.trim();
        const memo = row.memo?.trim();

        // Skip credits (deposits, refunds, etc.)
        if (row.type === "credit") {
          skipped++;
          continue;
        }

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

        // Find best CoA account based on description/memo
        const expenseAccountId = await findBestAccount(`${description} ${memo || ""}`, supabase, orgId);
        if (!expenseAccountId) {
          failed++;
          continue;
        }

        // Record the expense
        await recordExpense(serviceDb, orgId, {
          date,
          amount,
          description,
          expenseAccountId,
          paymentSourceId: null, // Bank statement, so credit the bank
          projectId: null,
        });

        inserted++;
      } catch (err) {
        console.error("[ofx-import] Row error:", err);
        failed++;
      }
    }

    // Revalidate the expenses page
    revalidatePath("/books/expenses");
    revalidatePath("/books/journal");
    revalidatePath("/books/reports");
    revalidatePath("/reports");

    return NextResponse.json({ inserted, failed, skipped });
  } catch (err) {
    console.error("[ofx-import] Endpoint error:", err);
    const msg = err instanceof Error ? err.message : t("expenses.import.failed");
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
