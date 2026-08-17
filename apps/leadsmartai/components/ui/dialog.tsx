"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

/**
 * Radix-backed Dialog primitive — the shadcn-style composition pattern.
 *
 * Replaces ad-hoc "modal overlay + click outside to close" implementations
 * with a single accessible primitive. Gains over hand-rolled modals:
 *
 *   - Focus trap and restoration handled by Radix.
 *   - ARIA wiring (role="dialog", aria-modal, aria-labelledby) automatic.
 *   - Escape-to-close + portal mount under <body> so stacking contexts
 *     don't bury the overlay behind a sticky header.
 *   - Animation hooks via `data-[state=open|closed]` so the overlay/content
 *     fade + slide in/out using the existing brand-tinted shadow tokens
 *     (`shadow-modal` from globals.css).
 *
 * Usage (shadcn convention):
 *
 *   <Dialog>
 *     <DialogTrigger asChild><Button>Open</Button></DialogTrigger>
 *     <DialogContent>
 *       <DialogHeader>
 *         <DialogTitle>Are you sure?</DialogTitle>
 *         <DialogDescription>This cannot be undone.</DialogDescription>
 *       </DialogHeader>
 *       <DialogFooter>
 *         <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
 *         <Button variant="destructive">Delete</Button>
 *       </DialogFooter>
 *     </DialogContent>
 *   </Dialog>
 */
const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      // Backdrop — semi-opaque ink with a soft blur. The blur is what
      // separates this from the previous custom modal overlay, which
      // looked flat. Fade is driven by Radix's `data-state` attribute
      // — we keep it to core Tailwind utilities (opacity + transition)
      // instead of pulling in tailwindcss-animate, so v4 builds clean.
      className={cn(
        "fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-sm transition-opacity duration-200 ease-out data-[state=closed]:opacity-0",
        className,
      )}
      {...props}
    />
  );
});

type DialogContentProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  /** Hide the built-in close button (e.g. for confirmation modals where
   *  the user must explicitly pick one of the actions). */
  hideCloseButton?: boolean;
};

const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent({ className, children, hideCloseButton, ...props }, ref) {
  const { t } = useTranslation("dashboard");
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Centered card, brand-tinted `shadow-modal` token from
          // globals.css. Open state = scale-100 + full opacity; closed
          // state = scale-95 + opacity-0 (set via Radix's data-state
          // attribute). Transition interpolates → soft pop-in + fade.
          // Core Tailwind utilities only — no plugin required.
          "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-modal transition-all duration-200 ease-out dark:border-slate-700 dark:bg-slate-900",
          "data-[state=closed]:scale-95 data-[state=closed]:opacity-0",
          className,
        )}
        {...props}
      >
        {children}
        {!hideCloseButton ? (
          <DialogPrimitive.Close
            // Top-right "X" close button. Keyboard users still get the
            // Escape-to-close behavior; this is for mouse + touch.
            className="absolute right-4 top-4 rounded-md p-1 text-slate-500 opacity-70 ring-offset-white transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[#0072ce]/40 focus:ring-offset-2 disabled:pointer-events-none dark:text-slate-400 dark:ring-offset-slate-900"
            aria-label={t("pages.misc.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});

function DialogHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 text-center sm:text-left",
        className,
      )}
      {...props}
    />
  );
}

function DialogFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3",
        className,
      )}
      {...props}
    />
  );
}

const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(
        "font-heading text-lg font-bold leading-none tracking-tight text-slate-900 dark:text-white",
        className,
      )}
      {...props}
    />
  );
});

const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn(
        "text-sm leading-relaxed text-slate-600 dark:text-slate-400",
        className,
      )}
      {...props}
    />
  );
});

/**
 * Lightweight composition helper for the common case where you just
 * want a body of content inside the dialog. Avoids the boilerplate of
 * always wiring up DialogHeader/Title/Description for one-off uses.
 */
function DialogBody({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("py-2", className)}>{children}</div>;
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
};
