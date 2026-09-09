"use client";

import { useTranslation } from "react-i18next";
import { CreditCard } from "lucide-react";

interface Props {
  invoiceId: string;
}

export function PayButton({ invoiceId }: Props) {
  const { t } = useTranslation("public");

  return (
    <a
      href={`/api/stripe/checkout?invoice=${invoiceId}`}
      className="flex items-center gap-2.5 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-indigo-200"
    >
      <CreditCard className="w-4 h-4" />
      {t("pay.payNow")}
    </a>
  );
}
