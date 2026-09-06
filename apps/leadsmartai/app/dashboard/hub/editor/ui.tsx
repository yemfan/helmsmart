"use client";

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";

/**
 * The editor's form vocabulary — one look for every field on every section,
 * so the fifteen sections read as one tool rather than fifteen.
 *
 * Nothing here knows about the hub document; these are inputs with labels,
 * hints and the standard save button whose label reports the outcome
 * ("Saved!") instead of a banner.
 */

export const INPUT =
  "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-[#0072ce] focus:ring-2 focus:ring-[#0072ce]/20 disabled:bg-gray-50 disabled:text-gray-500";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm font-medium text-gray-700 ${className ?? ""}`}>
      {label}
      {children}
      {hint ? <span className="mt-1 block text-xs font-normal text-gray-500">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  maxLength,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className={INPUT}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      placeholder={placeholder}
      maxLength={maxLength}
      className={INPUT}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
  disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={INPUT}>
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Green-on / gray-off switch right next to its label — the app-wide rule. */
export function SwitchRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-1">
      <Toggle checked={checked} onChange={onChange} label={label} disabled={disabled} />
      <div className="min-w-0">
        <p className={`text-sm font-medium ${disabled ? "text-gray-400" : "text-gray-900"}`}>{label}</p>
        {hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
      </div>
    </div>
  );
}

export type SaveState = "idle" | "saving" | "saved" | "error";

export function SaveButton({
  state,
  onClick,
  disabled,
  error,
}: {
  state: SaveState;
  onClick: () => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const { t } = useTranslation("dashboard");
  const label =
    state === "saving"
      ? t("pages.hubEditor.saving")
      : state === "saved"
        ? t("pages.hubEditor.saved")
        : state === "error"
          ? t("pages.hubEditor.saveFailed")
          : t("pages.hubEditor.save");
  return (
    <div className="flex flex-wrap items-center gap-3 pt-2">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled || state === "saving"}
        className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
          state === "error" ? "bg-red-600 hover:bg-red-700" : "bg-gray-900 hover:bg-gray-700"
        }`}
      >
        {label}
      </button>
      {state === "error" && error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Up / down / remove for an ordered list row. */
export function RowControls({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("dashboard");
  const btn =
    "inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 ring-1 ring-inset ring-gray-200 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40";
  return (
    <div className="flex shrink-0 gap-1">
      <button type="button" className={btn} onClick={() => onMove(index, index - 1)} disabled={index === 0} aria-label={t("pages.hubEditor.moveUp")}>
        <ArrowUp className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" className={btn} onClick={() => onMove(index, index + 1)} disabled={index >= count - 1} aria-label={t("pages.hubEditor.moveDown")}>
        <ArrowDown className="h-4 w-4" aria-hidden />
      </button>
      <button type="button" className={`${btn} hover:text-red-700`} onClick={onRemove} aria-label={t("pages.hubEditor.remove")}>
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

export function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {description ? <p className="mt-0.5 mb-4 text-xs text-gray-500">{description}</p> : <div className="mb-4" />}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">{children}</p>;
}

export function AddButton({ onClick, children, disabled }: { onClick: () => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Split a textarea into trimmed non-empty lines, clamped. */
export function lines(v: string, max: number): string[] {
  return v
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}
