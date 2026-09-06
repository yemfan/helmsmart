"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ConfirmOptions = {
  /** Optional heading; when omitted the first sentence of `message` is used. */
  title?: string;
  /** Red confirm button. Inferred from the wording when not set. */
  destructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
};

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Split "Delete this offer? This cannot be undone." into a title and a body. */
function splitMessage(message: string): { title: string; body: string } {
  const text = message.trim();
  const nl = text.indexOf("\n");
  if (nl > 0) return { title: text.slice(0, nl).trim(), body: text.slice(nl).trim() };
  const q = text.indexOf("?");
  if (q > 0 && q < text.length - 1) return { title: text.slice(0, q + 1).trim(), body: text.slice(q + 1).trim() };
  return { title: text, body: "" };
}

const DESTRUCTIVE = /\b(delete|remove|cannot be undone|can't be undone|permanently|cancel this|disconnect|archive)\b/i;

/**
 * App-wide replacement for `window.confirm`.
 *
 *   const confirmDialog = useConfirm();
 *   if (!(await confirmDialog("Delete this offer? This cannot be undone."))) return;
 *
 * Same call shape as the native one (message in, boolean out) so the 38
 * `confirm()` sites migrate mechanically — but rendered with the Radix
 * Dialog: focus trapped, Escape to cancel, styled, and translatable. Falls
 * back to the native dialog when no provider is mounted (marketing pages).
 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  return (
    ctx ??
    (async (message: string) => (typeof window === "undefined" ? false : window.confirm(message)))
  );
}

type Pending = {
  title: string;
  body: string;
  destructive: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("common");
  const [pending, setPending] = useState<Pending | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((message, options) => {
    const { title, body } = splitMessage(message);
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false); // a second ask cancels the first
      resolver.current = resolve;
      setPending({
        title: options?.title ?? title,
        body,
        destructive: options?.destructive ?? DESTRUCTIVE.test(message),
        confirmLabel: options?.confirmLabel,
        cancelLabel: options?.cancelLabel,
      });
    });
  }, []);

  function settle(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setPending(null);
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) settle(false); }}>
        {pending ? (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{pending.title}</DialogTitle>
              {pending.body ? <DialogDescription className="whitespace-pre-line">{pending.body}</DialogDescription> : null}
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => settle(false)}>
                {pending.cancelLabel ?? t("actions.cancel")}
              </Button>
              <Button variant={pending.destructive ? "destructive" : "default"} onClick={() => settle(true)} autoFocus>
                {pending.confirmLabel ?? (pending.destructive ? t("actions.delete") : t("actions.confirm"))}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </ConfirmContext.Provider>
  );
}
