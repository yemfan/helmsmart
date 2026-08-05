"use client";

/**
 * Live password requirements + strength meter — the Zillow-style signup UX:
 * as the user types, each rule flips from muted to green and a strength bar
 * fills. `evaluatePassword` is the single source of truth for the policy so
 * the form can gate submit on `allMet` while this component renders the
 * feedback. Client-side only (guidance + friendlier failures); the real
 * account is still created by Supabase, which accepts any password at least
 * this strong.
 */

export type PasswordCheck = { label: string; met: boolean };

export type PasswordEvaluation = {
  checks: PasswordCheck[];
  /** True when every rule passes — use this to enable the submit button. */
  allMet: boolean;
  /** 0–4, one point per satisfied rule. */
  score: number;
  /** "" while empty, else Weak / Fair / Good / Strong. */
  label: string;
};

export function evaluatePassword(pw: string): PasswordEvaluation {
  const checks: PasswordCheck[] = [
    { label: "At least 8 characters", met: pw.length >= 8 },
    { label: "Mix of letters and numbers", met: /[a-zA-Z]/.test(pw) && /\d/.test(pw) },
    { label: "At least 1 special character", met: /[^a-zA-Z0-9]/.test(pw) },
    { label: "Mix of uppercase and lowercase", met: /[a-z]/.test(pw) && /[A-Z]/.test(pw) },
  ];
  const score = checks.filter((c) => c.met).length;
  const label = pw.length === 0 ? "" : score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong";
  return { checks, allMet: score === checks.length, score, label };
}

function CheckIcon({ met }: { met: boolean }) {
  return met ? (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" aria-hidden>
      <path d="M13 4.5 6.5 11 3 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-gray-300" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

export function PasswordStrength({ password, className = "" }: { password: string; className?: string }) {
  if (!password) return null;
  const { checks, score, label } = evaluatePassword(password);
  const barColor =
    score <= 1 ? "bg-red-500" : score === 2 ? "bg-amber-500" : score === 3 ? "bg-emerald-500" : "bg-emerald-600";
  const labelColor =
    score <= 1 ? "text-red-600" : score === 2 ? "text-amber-600" : "text-emerald-700";
  return (
    <div className={`pt-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
          <div
            className={`h-full rounded-full transition-all duration-200 ${barColor}`}
            style={{ width: `${(score / 4) * 100}%` }}
          />
        </div>
        <span className={`w-10 text-right text-[11px] font-semibold ${labelColor}`} aria-live="polite">
          {label}
        </span>
      </div>
      <ul className="mt-1.5 space-y-0.5">
        {checks.map((c) => (
          <li
            key={c.label}
            className={`flex items-center gap-1.5 text-[11px] ${c.met ? "text-emerald-700" : "text-gray-500"}`}
          >
            <CheckIcon met={c.met} />
            {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
