"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/**
 * Sheet — a side panel on the Radix Dialog primitive.
 *
 * The lead profile drawer, the setup wizard and several detail panels were
 * hand-rolled `fixed inset-0` overlays; none trapped focus, and the drawer
 * could not be closed with Escape until a listener was bolted on (2026-09 UX
 * audit). Building on Dialog gives every panel the same contract for free:
 * focus moves in and is restored, Escape and the backdrop close it, the
 * portal escapes any transformed ancestor, and `aria-modal` is wired.
 *
 *   <Sheet open={!!id} onOpenChange={(o) => !o && close()}>
 *     <SheetContent aria-label="Lead profile">…</SheetContent>
 *   </Sheet>
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function SheetOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-[1px] transition-opacity duration-200 data-[state=closed]:opacity-0",
        className,
      )}
      {...props}
    />
  );
});

type Side = "right" | "left" | "bottom";

const sideClass: Record<Side, string> = {
  right: "inset-y-0 right-0 h-full w-full max-w-md border-l data-[state=closed]:translate-x-full",
  left: "inset-y-0 left-0 h-full w-full max-w-md border-r data-[state=closed]:-translate-x-full",
  bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t data-[state=closed]:translate-y-full",
};

type SheetContentProps = ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  side?: Side;
  hideCloseButton?: boolean;
};

const SheetContent = forwardRef<ElementRef<typeof DialogPrimitive.Content>, SheetContentProps>(
  function SheetContent({ side = "right", className, children, hideCloseButton, ...props }, ref) {
    const { t } = useTranslation("dashboard");
    return (
      <SheetPortal>
        <SheetOverlay />
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "fixed z-50 flex flex-col overflow-y-auto border-slate-200 bg-white shadow-2xl transition-transform duration-200 ease-out dark:border-slate-700 dark:bg-slate-900",
            sideClass[side],
            className,
          )}
          {...props}
        >
          {children}
          {!hideCloseButton ? (
            <DialogPrimitive.Close
              className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0072ce]/40 dark:hover:bg-slate-800"
              aria-label={t("pages.misc.close")}
            >
              <X className="h-4 w-4" aria-hidden />
            </DialogPrimitive.Close>
          ) : null}
        </DialogPrimitive.Content>
      </SheetPortal>
    );
  },
);

function SheetHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-slate-100 px-4 pb-3 pt-4 dark:border-slate-800", className)} {...props} />;
}

const SheetTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("text-lg font-semibold text-slate-900 dark:text-white", className)}
      {...props}
    />
  );
});

const SheetDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function SheetDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-xs text-slate-500 dark:text-slate-400", className)}
      {...props}
    />
  );
});

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetOverlay, SheetPortal, SheetTitle, SheetTrigger };
