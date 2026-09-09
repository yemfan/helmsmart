"use client";

import { useTranslation } from "react-i18next";

export function PrintButton() {
  const { t } = useTranslation("clients");
  return (
    <button onClick={() => window.print()}>{t("statement.print")}</button>
  );
}
