import { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Centered auth flows — same atmospheric background as CloseBoss / PropertyTools marketing.
 */
export default function AuthPageShell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-slate-50 via-white to-slate-100/80 px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.38]"
        aria-hidden
        style={{
          backgroundImage:
            "radial-gradient(ellipse 90% 55% at 50% -25%, rgba(0,114,206,0.16), transparent 55%)",
        }}
      />
      <div className={cn("relative w-full", wide ? "max-w-lg" : "max-w-md")}>{children}</div>
    </div>
  );
}
