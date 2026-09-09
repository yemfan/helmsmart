"use server";

import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { normalizePayee } from "@/lib/payee";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { languageDirectiveForJson } from "@/lib/i18n/directives";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type RawTxn = {
  id: string;
  name: string;
  merchant_name: string | null;
  amount: number;
  date: string;
  personal_finance_category: string | null;
  category_legacy: string[] | null;
};

type CoaRow = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type Categorization = {
  transaction_id: string;
  account_code: string;
  confidence: number;
  memo: string;
};

type ClaudeResult = {
  categorizations: Categorization[];
};

/**
 * Categorize a batch of uncategorized bank_transactions using Claude.
 *
 * Fetches uncategorized transactions for the org, passes them to Claude
 * alongside the chart of accounts, then writes back:
 *   - coa_account_id (matched by account code)
 *   - ai_category_confidence
 *   - ai_suggested_memo
 *
 * Safe to call multiple times — only processes transactions where
 * coa_account_id IS NULL.
 *
 * @param orgId   Organization UUID
 * @param limit   Max transactions to categorize per call (default 50)
 */
export async function categorizeTransactions(
  orgId: string,
  limit = 50
): Promise<{ categorized: number; error?: string }> {
  // Read the locale FIRST: the Plaid sync route fires this off without
  // awaiting it, so the cookie has to be read while the request is still up.
  const locale = await getServerLocale();
  const t = await getServerT("books");
  const service = await createServiceClient();

  // 1. Fetch org metadata for context
  const { data: org } = await service
    .from("organizations")
    .select("name, entity_type")
    .eq("id", orgId)
    .single();

  if (!org) return { categorized: 0, error: t("transactions.errors.orgNotFound") };

  // 2. Fetch chart of accounts (expense + revenue only — those are the targets)
  const { data: coa } = await service
    .from("chart_of_accounts")
    .select("id, code, name, type")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .in("type", ["expense", "revenue", "asset", "liability"])
    .order("code");

  if (!coa?.length) return { categorized: 0, error: t("transactions.errors.noChartOfAccounts") };

  // 3. Fetch uncategorized transactions
  const { data: txns } = await service
    .from("bank_transactions")
    .select("id, name, merchant_name, amount, date, personal_finance_category, category_legacy")
    .eq("organization_id", orgId)
    .is("coa_account_id", null)
    .eq("pending", false)
    .order("date", { ascending: false })
    .limit(limit);

  if (!txns?.length) return { categorized: 0 };

  // 3b. Payee memory — auto-apply categories the owner has already confirmed for
  // these payees, so repeat vendors skip the AI (and the owner skips re-review).
  const { data: memory } = await service
    .from("payee_categories")
    .select("payee_key, coa_account_id")
    .eq("organization_id", orgId);
  const payeeMap = new Map(
    (memory ?? []).map((m) => [m.payee_key as string, m.coa_account_id as string])
  );

  let memoryMatched = 0;
  const toAi: RawTxn[] = [];
  for (const txn of txns as RawTxn[]) {
    const key = normalizePayee(txn.merchant_name ?? txn.name);
    const remembered = key ? payeeMap.get(key) : undefined;
    if (remembered) {
      const { error } = await service
        .from("bank_transactions")
        .update({ coa_account_id: remembered, ai_category_confidence: 1, ai_suggested_memo: null })
        .eq("id", txn.id)
        .eq("organization_id", orgId);
      if (!error) memoryMatched++;
    } else {
      toAi.push(txn);
    }
  }

  // Everything matched memory — no AI call needed.
  if (!toAi.length) return { categorized: memoryMatched };

  // 4. Build CoA reference string
  const coaText = (coa as CoaRow[])
    .map((a) => `${a.code} | ${a.name} | ${a.type}`)
    .join("\n");

  // 5. Build transaction list (only the payees memory didn't already handle)
  const txnText = toAi
    .map((txn) => {
      const direction = txn.amount > 0 ? "DEBIT (money out)" : "CREDIT (money in)";
      const merchant = txn.merchant_name ?? txn.name;
      const cat = txn.personal_finance_category ?? txn.category_legacy?.join(" > ") ?? "";
      return `ID:${txn.id} | ${txn.date} | ${direction} $${Math.abs(txn.amount).toFixed(2)} | ${merchant} | ${cat}`;
    })
    .join("\n");

  // 6. Call Claude
  const systemPrompt = `You are an expert bookkeeper for a ${org.entity_type.replace("_", " ")} business called "${org.name}".
Your job is to categorize bank transactions into the correct account from the chart of accounts.

Rules:
- DEBIT transactions (money out, positive Plaid amount) → expense or liability accounts
- CREDIT transactions (money in, negative Plaid amount) → revenue or asset accounts
- Match as specifically as possible (e.g. "UBER" → Auto & Truck Expenses, not Other Expenses)
- For transfers between own accounts, use the most appropriate asset account
- confidence: 0.95+ very sure, 0.80-0.94 reasonably sure, 0.60-0.79 uncertain, below 0.60 = use Other
- memo: 3-8 word plain-language description of what the charge is for

Respond ONLY with valid JSON matching this schema exactly:
{
  "categorizations": [
    { "transaction_id": "uuid", "account_code": "code", "confidence": 0.0, "memo": "string" }
  ]
}`;

  // The owner reads `memo`, so it comes back in their language. Everything
  // else in the response is a wire value: `transaction_id` and
  // `account_code` are looked up by exact match, and a translated code is
  // silently dropped. Appended only for a non-English reader, so the
  // English prompt stays one stable cache prefix.
  const directive = languageDirectiveForJson(locale);
  const system = directive
    ? `${systemPrompt}${directive}
"transaction_id" and "account_code" are identifiers copied from the input above. Reproduce them character for character; never translate or reformat them. Only "memo" is prose.`
    : systemPrompt;

  const userPrompt = `Chart of accounts (code | name | type):
${coaText}

Transactions to categorize (ID | date | direction | amount | merchant | Plaid category):
${txnText}`;

  let result: ClaudeResult;
  try {
    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      system,
      messages: [{ role: "user", content: userPrompt }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    // Strip markdown code fences if present
    const json = text.replace(/```(?:json)?\n?/g, "").trim();
    result = JSON.parse(json) as ClaudeResult;
  } catch (err) {
    console.error("[categorize] Claude call failed:", err);
    return { categorized: 0, error: t("transactions.errors.categorizeFailed") };
  }

  if (!result.categorizations?.length) return { categorized: 0 };

  // 7. Build a code → id map for fast lookup
  const codeToId = new Map((coa as CoaRow[]).map((a) => [a.code, a.id]));

  // 8. Write back to DB
  let categorized = 0;
  for (const cat of result.categorizations) {
    const accountId = codeToId.get(cat.account_code);
    if (!accountId) continue; // Claude hallucinated a code — skip

    const { error } = await service
      .from("bank_transactions")
      .update({
        coa_account_id: accountId,
        ai_category_confidence: Math.min(1, Math.max(0, cat.confidence)),
        ai_suggested_memo: cat.memo ?? null,
      })
      .eq("id", cat.transaction_id)
      .eq("organization_id", orgId); // extra safety: can't touch other orgs

    if (!error) categorized++;
  }

  return { categorized: categorized + memoryMatched };
}
