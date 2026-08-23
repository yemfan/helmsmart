"use client";

import { ChangeEvent } from "react";

interface InputFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Hold a typed value to the range the field declares.
 *
 * `min`/`max` on a number input only bind the spinner arrows and native form
 * validation — a typed value passes straight through. So a vacancy field
 * declaring `max={50}` accepted 150, and the calculator dutifully reported an
 * effective income of -$33,000 and a cap rate of -6.31% in the same confident
 * styling as a real answer.
 */
function clamp(v: number, min?: number, max?: number): number {
  if (!Number.isFinite(v)) return min ?? 0;
  if (min != null && v < min) return min;
  if (max != null && v > max) return max;
  return v;
}

export default function InputField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: InputFieldProps) {
  return (
    <div>
      <label className="block text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(clamp(Number(e.target.value), min, max))}
        className="w-full border border-gray-300 rounded p-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
