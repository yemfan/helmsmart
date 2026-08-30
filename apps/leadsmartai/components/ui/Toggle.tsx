"use client";

/**
 * Standard on/off switch for all CloseBoss toggles.
 *
 * DESIGN RULE (applies app-wide): a boolean control is a sliding switch that is
 * GREEN (emerald-500) when on and GRAY (slate-300) when off, sits RIGHT NEXT TO
 * its label (never pushed to the far edge with justify-between), and — when the
 * thing it controls has options — is paired with a separate settings/gear
 * button. The switch answers "on or off?"; the gear answers "configure it".
 *
 * Ported from apps/helmsmart-web/components/ui/toggle.tsx, which is the
 * reference implementation. The rule is the same across every app; keep the two
 * in step if either changes.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Accessible name — required, since the switch shows no text itself. */
  label: string;
  size?: "sm" | "md";
}) {
  const track = size === "sm" ? "h-4 w-7" : "h-5 w-9";
  const thumb = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const shift =
    size === "sm"
      ? checked
        ? "translate-x-3.5"
        : "translate-x-0.5"
      : checked
        ? "translate-x-4"
        : "translate-x-0.5";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex ${track} shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 ${
        checked ? "bg-emerald-500" : "bg-slate-300"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block ${thumb} transform rounded-full bg-white shadow transition-transform ${shift}`}
      />
    </button>
  );
}
