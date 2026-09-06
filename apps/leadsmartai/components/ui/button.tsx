import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type MouseEventHandler } from "react";
import { cn } from "@/lib/utils";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive" | "inverse" | "gradient";
  size?: "default" | "sm" | "lg";
  href?: string;
};

/**
 * Variant classes — `shadow-raised`/`shadow-floating` resolve to the
 * brand-tinted elevation tokens declared in `app/globals.css` (`@theme`
 * block). Hover lifts a level so the button reads as a 3D object rather
 * than a flat rectangle. `hover:-translate-y-px` adds the matching
 * vertical motion — the combination is what gives Linear/Vercel CTAs
 * their tactile feel.
 */
const variantClass: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "bg-[#0072ce] !text-white shadow-raised hover:bg-[#005ca8] hover:-translate-y-px hover:shadow-floating focus-visible:ring-[#0072ce] dark:hover:bg-[#4da3e8] dark:focus-visible:ring-offset-slate-900",
  outline:
    "border border-slate-200/90 bg-white !text-slate-900 shadow-raised ring-1 ring-slate-900/[0.03] hover:border-slate-300 hover:bg-slate-50 hover:-translate-y-px hover:shadow-floating dark:border-slate-700 dark:bg-slate-900 dark:!text-slate-100 dark:hover:bg-slate-800 dark:focus-visible:ring-offset-slate-900",
  secondary:
    "bg-slate-100 !text-slate-900 shadow-raised hover:bg-slate-200 hover:-translate-y-px hover:shadow-floating dark:bg-slate-800 dark:!text-slate-100 dark:hover:bg-slate-700 dark:focus-visible:ring-offset-slate-900",
  ghost:
    "!text-slate-900 hover:bg-slate-100 dark:!text-slate-100 dark:hover:bg-slate-800",
  destructive:
    "bg-red-600 !text-white shadow-raised hover:bg-red-700 hover:-translate-y-px hover:shadow-floating focus-visible:ring-red-500",
  inverse:
    "border-2 border-white/90 bg-transparent !text-white shadow-none hover:bg-white/15 focus-visible:ring-white/70 focus-visible:ring-offset-slate-900",
  gradient:
    "bg-gradient-to-r from-[#0072ce] to-[#4F46E5] !text-white shadow-floating hover:shadow-overlay hover:-translate-y-px hover:brightness-110 focus-visible:ring-[#0072ce]",
};

const sizeClass: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-lg px-3 text-xs",
  lg: "h-11 rounded-xl px-8 text-base",
};

const baseClass =
  "inline-flex items-center justify-center rounded-xl text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "default", size = "default", href, type = "button", onClick, ...props },
  ref
) {
  const classes = cn(baseClass, variantClass[variant], sizeClass[size], className);

  if (href) {
    return (
      <Link href={href} className={classes} onClick={onClick as unknown as MouseEventHandler<HTMLAnchorElement> | undefined}>
        {props.children}
      </Link>
    );
  }

  return (
    <button ref={ref} type={type} className={classes} onClick={onClick} {...props} />
  );
});
