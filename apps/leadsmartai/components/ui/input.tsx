import {
  forwardRef,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Form primitives — one look for every text field, select, textarea and
 * checkbox in the product.
 *
 * Before these existed each page wrote its own classes: borders alternated
 * between slate-200 and slate-300, radii between `rounded`, `rounded-lg` and
 * `rounded-xl`, heights between 36 and 44px, and half the fields had no focus
 * ring at all (2026-09 UX audit, design-system section). The shared classes
 * below are the ones the Button and Card primitives already use, so a form
 * reads as one object with the buttons beside it.
 *
 *   <Field label="Email" error={errors.email}>
 *     <Input type="email" value={email} onChange={…} />
 *   </Field>
 */

const control =
  "block w-full rounded-lg border border-slate-300 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 transition focus:border-[#0072ce] focus:outline-none focus:ring-2 focus:ring-[#0072ce]/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500";

const sizeClass = {
  sm: "h-9 px-2.5 text-sm",
  default: "h-10 px-3 text-sm",
} as const;

type Size = keyof typeof sizeClass;

export type InputProps = InputHTMLAttributes<HTMLInputElement> & { inputSize?: Size };

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, inputSize = "default", ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, sizeClass[inputSize], className)} {...props} />;
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { inputSize?: Size };

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, inputSize = "default", ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cn(
        control,
        sizeClass[inputSize],
        // Native chevron, drawn once here so every select gets the same one.
        "appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px_16px] bg-[position:right_0.6rem_center] bg-no-repeat pr-9",
        className,
      )}
      {...props}
    />
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(control, "px-3 py-2 text-sm leading-relaxed", className)}
      {...props}
    />
  );
});

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-4 w-4 shrink-0 rounded border-slate-300 text-[#0072ce] shadow-sm focus:ring-2 focus:ring-[#0072ce]/30 focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:bg-slate-900",
        className,
      )}
      {...props}
    />
  );
});

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-sm font-medium text-slate-700 dark:text-slate-300", className)}
      {...props}
    />
  );
}

/**
 * Label + control + hint/error, stacked. Pass `htmlFor` to bind the label to
 * the control's id; the error renders with `role="alert"` under the control
 * (house rule: errors go below the control, in small rose text).
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-rose-600" aria-hidden>*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
