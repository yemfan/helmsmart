"use client";

import { useTranslation } from "react-i18next";

export function PriorityFilter({
  statusFilter,
  priorityFilter,
}: {
  statusFilter: string;
  priorityFilter: string;
}) {
  const { t } = useTranslation("tasks");

  return (
    <select
      defaultValue={priorityFilter}
      aria-label={t("list.allPriorities")}
      onChange={(e) => {
        const p = e.target.value;
        const base = statusFilter ? `?status=${statusFilter}` : "?";
        const sep = statusFilter ? "&" : "";
        window.location.href = p
          ? `/tasks${base}${sep}priority=${p}`
          : `/tasks${statusFilter ? `?status=${statusFilter}` : ""}`;
      }}
      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      <option value="">{t("list.allPriorities")}</option>
      <option value="urgent">{t("priority.urgent")}</option>
      <option value="high">{t("priority.high")}</option>
      <option value="normal">{t("priority.normal")}</option>
      <option value="low">{t("priority.low")}</option>
    </select>
  );
}
