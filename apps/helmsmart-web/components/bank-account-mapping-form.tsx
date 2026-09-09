"use client";

import { useActionState } from "react";
import { useTranslation } from "react-i18next";
import { linkBankAccountToCoa } from "@/lib/actions/settings";
import type { SettingsState } from "@/lib/actions/settings";
import { Building2, CheckCircle2 } from "lucide-react";

interface CoaOption {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface BankAccount {
  id: string;
  name: string;
  type: string;
  subtype: string | null;
  mask: string | null;
  coa_account_id: string | null;
  institution: { institution_name: string | null } | { institution_name: string | null }[] | null;
}

interface Props {
  bankAccount: BankAccount;
  coaAccounts: CoaOption[];
}

export function BankAccountMappingForm({ bankAccount: ba, coaAccounts }: Props) {
  const { t } = useTranslation("books");
  const [state, action, isPending] = useActionState<SettingsState, FormData>(
    linkBankAccountToCoa,
    null
  );

  const institution = Array.isArray(ba.institution)
    ? ba.institution[0]?.institution_name
    : ba.institution?.institution_name;

  const isMapped = !!ba.coa_account_id || state?.success;
  const currentCoaId = ba.coa_account_id ?? "";

  return (
    <form action={action} className="flex items-center gap-4 bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
      <input type="hidden" name="bank_account_id" value={ba.id} />

      {/* Bank account info */}
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <div className="w-8 h-8 bg-white rounded-lg border border-slate-200 flex items-center justify-center flex-shrink-0">
          <Building2 className="w-4 h-4 text-slate-400" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {ba.name}{ba.mask ? ` ···${ba.mask}` : ""}
          </p>
          <p className="text-xs text-slate-400 capitalize">
            {institution ?? ""} {ba.subtype ?? ba.type}
          </p>
        </div>
      </div>

      {/* CoA selector */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <select
          name="coa_account_id"
          defaultValue={currentCoaId}
          disabled={isPending}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 min-w-[220px]"
        >
          <option value="">{t("transactions.mapping.notLinked")}</option>
          {coaAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.code} · {a.name}
            </option>
          ))}
        </select>

        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {isPending ? t("transactions.mapping.linking") : t("transactions.mapping.link")}
        </button>

        {isMapped && !isPending && (
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
        )}
      </div>
    </form>
  );
}
