/**
 * Default chart-of-accounts templates, one per entity type.
 *
 * ⚠ CPA REVIEW REQUIRED before setting tax_line_code values.
 * All tax_line_code fields are left null until a CPA validates the
 * correct Schedule C / 1120-S / 1065 line-item mappings.
 *
 * Account code ranges:
 *   1000–1999  Assets
 *   2000–2999  Liabilities
 *   3000–3999  Equity  (varies by entity type)
 *   4000–4999  Revenue
 *   6000–6999  Expenses
 */

export type AccountSeed = {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  normal_balance: "debit" | "credit";
  description?: string;
  /** ⚠ CPA review required — null until validated */
  tax_line_code: string | null;
};

// ─── Assets ───────────────────────────────────────────────────────────────────

const ASSETS: AccountSeed[] = [
  { code: "1010", name: "Checking Account",     type: "asset", normal_balance: "debit",  tax_line_code: null },
  { code: "1020", name: "Savings Account",      type: "asset", normal_balance: "debit",  tax_line_code: null },
  { code: "1050", name: "Petty Cash",           type: "asset", normal_balance: "debit",  tax_line_code: null },
  { code: "1200", name: "Accounts Receivable",  type: "asset", normal_balance: "debit",  tax_line_code: null },
  { code: "1400", name: "Prepaid Expenses",     type: "asset", normal_balance: "debit",  tax_line_code: null },
  { code: "1500", name: "Equipment",            type: "asset", normal_balance: "debit",  tax_line_code: null },
  { code: "1510", name: "Vehicles",             type: "asset", normal_balance: "debit",  tax_line_code: null },
  { code: "1900", name: "Other Assets",         type: "asset", normal_balance: "debit",  tax_line_code: null },
];

// ─── Liabilities ──────────────────────────────────────────────────────────────

const LIABILITIES: AccountSeed[] = [
  { code: "2000", name: "Accounts Payable",     type: "liability", normal_balance: "credit", tax_line_code: null },
  { code: "2100", name: "Credit Cards Payable", type: "liability", normal_balance: "credit", tax_line_code: null },
  { code: "2200", name: "Loans Payable",        type: "liability", normal_balance: "credit", tax_line_code: null },
  { code: "2900", name: "Other Liabilities",    type: "liability", normal_balance: "credit", tax_line_code: null },
];

// ─── Equity (varies by entity) ────────────────────────────────────────────────

const EQUITY_BY_ENTITY: Record<string, AccountSeed[]> = {
  sole_prop: [
    { code: "3000", name: "Owner's Capital",    type: "equity", normal_balance: "credit", tax_line_code: null },
    { code: "3100", name: "Owner's Draws",      type: "equity", normal_balance: "debit",  tax_line_code: null },
    { code: "3900", name: "Retained Earnings",  type: "equity", normal_balance: "credit", tax_line_code: null },
  ],
  llc: [
    { code: "3000", name: "Member Capital",        type: "equity", normal_balance: "credit", tax_line_code: null },
    { code: "3100", name: "Member Distributions",  type: "equity", normal_balance: "debit",  tax_line_code: null },
    { code: "3900", name: "Retained Earnings",     type: "equity", normal_balance: "credit", tax_line_code: null },
  ],
  s_corp: [
    { code: "3000", name: "Capital Stock",              type: "equity", normal_balance: "credit", tax_line_code: null },
    { code: "3100", name: "Shareholder Distributions",  type: "equity", normal_balance: "debit",  tax_line_code: null },
    { code: "3900", name: "Retained Earnings",          type: "equity", normal_balance: "credit", tax_line_code: null },
  ],
  c_corp: [
    { code: "3000", name: "Common Stock",      type: "equity", normal_balance: "credit", tax_line_code: null },
    { code: "3900", name: "Retained Earnings", type: "equity", normal_balance: "credit", tax_line_code: null },
  ],
  partnership: [
    { code: "3000", name: "Partner Capital",       type: "equity", normal_balance: "credit", tax_line_code: null },
    { code: "3100", name: "Partner Distributions", type: "equity", normal_balance: "debit",  tax_line_code: null },
    { code: "3900", name: "Retained Earnings",     type: "equity", normal_balance: "credit", tax_line_code: null },
  ],
  // Non-profits report net assets (FASB ASC 958), not owner equity/retained earnings.
  nonprofit: [
    { code: "3000", name: "Net Assets Without Donor Restrictions", type: "equity", normal_balance: "credit", tax_line_code: null },
    { code: "3100", name: "Net Assets With Donor Restrictions",    type: "equity", normal_balance: "credit", tax_line_code: null },
  ],
};

// ─── Revenue ──────────────────────────────────────────────────────────────────

const REVENUE: AccountSeed[] = [
  { code: "4000", name: "Revenue",      type: "revenue", normal_balance: "credit", tax_line_code: null },
  { code: "4100", name: "Other Income", type: "revenue", normal_balance: "credit", tax_line_code: null },
];

// ─── Expenses ─────────────────────────────────────────────────────────────────

const EXPENSES: AccountSeed[] = [
  { code: "6010", name: "Advertising & Marketing",        type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6020", name: "Auto & Truck Expenses",          type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6030", name: "Bank Fees & Charges",            type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6040", name: "Business Insurance",             type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6050", name: "Contract Labor",                 type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6060", name: "Dues & Subscriptions",           type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6070", name: "Equipment & Supplies",           type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6080", name: "Home Office Deduction",          type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6090", name: "Interest Expense",               type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6100", name: "Legal & Professional Services",  type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6110", name: "Meals & Entertainment (50%)",    type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6120", name: "Office Supplies",                type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6130", name: "Rent & Lease",                   type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6140", name: "Repairs & Maintenance",          type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6150", name: "Taxes & Licenses",               type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6160", name: "Telephone & Internet",           type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6170", name: "Travel",                         type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6180", name: "Utilities",                      type: "expense", normal_balance: "debit", tax_line_code: null },
  { code: "6900", name: "Other Expenses",                 type: "expense", normal_balance: "debit", tax_line_code: null },
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a full chart of accounts for the given entity type,
 * sorted by account code.
 */
export function getAccountsForEntityType(entityType: string): AccountSeed[] {
  const equity = EQUITY_BY_ENTITY[entityType] ?? EQUITY_BY_ENTITY.sole_prop;
  return [...ASSETS, ...LIABILITIES, ...equity, ...REVENUE, ...EXPENSES].sort(
    (a, b) => a.code.localeCompare(b.code)
  );
}
