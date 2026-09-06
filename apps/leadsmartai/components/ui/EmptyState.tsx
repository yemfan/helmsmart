"use client";

import Link from "next/link";

type Action = {
  label: string;
  href?: string;
  onClick?: () => void;
};

export function EmptyState({
  icon,
  title,
  description,
  actions,
}: {
  icon?: string;
  title: string;
  description: string;
  actions?: Action[];
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && <div className="text-4xl mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>
      {actions && actions.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center">
          {actions.map((a, i) =>
            a.href ? (
              <Link
                key={i}
                href={a.href}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  i === 0
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {a.label}
              </Link>
            ) : (
              <button
                key={i}
                onClick={a.onClick}
                className={`rounded-lg px-4 py-2 text-sm font-medium ${
                  i === 0
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
              >
                {a.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
