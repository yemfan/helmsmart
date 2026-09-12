"use client";

import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

import { PlaidLink } from "@/components/plaid-link";
import { bankConnectionProblem } from "@/lib/bank-connection-error";

interface Props {
  /** The errored `bank_connections` row. */
  connectionId: string;
  /** `institution_name`, which Plaid does not always give us. */
  institutionName: string | null;
  /** Plaid's `error_code`, as `lib/plaid-sync.ts` recorded it. */
  errorCode: string | null;
}

/**
 * One line saying a linked bank has stopped importing, and — when signing in
 * again is what fixes it — the button that fixes it.
 *
 * Before this existed, `bank_connections.status` and `error_code` had no
 * reader anywhere. A bank whose login had lapsed simply stopped updating while
 * the Financial tab went on listing its accounts, so the balances stayed on
 * screen and quietly stopped being true.
 *
 * SHAPE (repo CLAUDE.md). This is status, so it is text in the page’s own type
 * — not a saturated gradient card with white type, which would outrank the
 * accounts it is about. Amber because a bank that stopped importing is a
 * warning: a light tint with a border, grouping the sentence with its remedy.
 *
 * The Reconnect button appears only for `repair: "reconnect"`. A bank that is
 * merely down recovers on its own and one Plaid dropped never comes back;
 * offering the button there would send the owner into a Link modal that cannot
 * help. `lib/bank-connection-error.ts` makes that call, with a unit test.
 */
export function BankConnectionAlert({ connectionId, institutionName, errorCode }: Props) {
  const { t } = useTranslation("settings");

  const institution = institutionName?.trim() || t("financial.bank.unnamedInstitution");
  const { message, repair } = bankConnectionProblem(errorCode, institution, t);

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-700">{message}</p>
        {repair === "reconnect" && (
          <div className="mt-2">
            <PlaidLink connectionId={connectionId}>
              {({ open, isLoading }) => (
                <button
                  type="button"
                  onClick={open}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg
                             hover:bg-amber-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? t("financial.bank.reconnecting") : t("financial.bank.reconnect")}
                </button>
              )}
            </PlaidLink>
          </div>
        )}
      </div>
    </div>
  );
}
