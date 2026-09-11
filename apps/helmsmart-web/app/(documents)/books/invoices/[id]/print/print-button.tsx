"use client";

import { useTranslation } from "react-i18next";

/**
 * The toolbar's print button. It is the OWNER's control — `.no-print`, never on
 * the client's copy — so it reads the owner's UI locale from the root layout's
 * `I18nProvider`, not the client's language the document around it is in.
 */
export function PrintButton() {
  const { t } = useTranslation("books");
  return <button onClick={() => window.print()}>{t("invoices.printToolbar.print")}</button>;
}
