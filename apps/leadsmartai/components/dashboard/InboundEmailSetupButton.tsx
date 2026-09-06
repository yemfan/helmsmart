"use client";

import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { intlLocale } from "@/lib/i18n/locale";

type InboundAlias = {
  address: string;
  domain: string;
  lastReceivedAt: string | null;
  inboundCount: number;
};

/**
 * Gmail auto-import setup, behind a gear.
 *
 * This used to be a permanently expanded blue card sitting above the
 * calendar — six setup steps and a verification note that every agent
 * reads once and then scrolls past forever. It lives here now: one
 * gear on the Conversations page (where forwarded email actually
 * lands), opening a dialog with the same address, the same one-time
 * Gmail filter recipe, and the import counter.
 *
 * Renders nothing until the alias resolves — `/api/dashboard/inbound-alias`
 * provisions it on first call, so a gear that opened onto an empty
 * address would be worse than no gear at all.
 */
export default function InboundEmailSetupButton({
  variant = "button",
}: {
  /**
   * "button" — a bare gear, for a page header (Conversations).
   * "row"    — gear inside a titled row, for a Settings card where it
   *            sits beside Google Calendar and needs to explain itself.
   */
  variant?: "button" | "row";
}) {
  const { t, i18n } = useTranslation("dashboard");
  const timeLocale = intlLocale(i18n.language);
  const [alias, setAlias] = useState<InboundAlias | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dashboard/inbound-alias")
      .then((r) => r.json())
      .then((b) => {
        if (cancelled || !b?.ok) return;
        setAlias({
          address: b.address,
          domain: b.domain,
          lastReceivedAt: b.lastReceivedAt ?? null,
          inboundCount: b.inboundCount ?? 0,
        });
      })
      .catch(() => {
        /* Setup is optional chrome — a failed probe just hides the gear. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!alias) return null;

  const gear = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      title={t("calendar.inbound.settingsLabel")}
      aria-label={t("calendar.inbound.settingsLabel")}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
    >
      <Settings className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{t("calendar.inbound.settingsLabel")}</span>
    </button>
  );

  return (
    <>
      {variant === "row" ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{t("calendar.inbound.heading")}</p>
            <p className="mt-0.5 text-xs text-slate-500">{t("calendar.inbound.body")}</p>
          </div>
          {gear}
        </div>
      ) : (
        gear
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("calendar.inbound.heading")}</DialogTitle>
            <DialogDescription>{t("calendar.inbound.body")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 font-mono text-[12px] text-slate-900">
              {alias.address}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(alias.address);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied ? t("calendar.inbound.copied") : t("calendar.inbound.copy")}
            </button>
          </div>

          <div className="text-xs text-slate-600">
            <p className="font-medium text-slate-700">{t("calendar.inbound.setupSummary")}</p>
            {/* Steps quote Gmail's own menu labels, so the translations use
                Google's published Chinese strings rather than literal ones. */}
            <ol className="mt-2 list-decimal space-y-1 pl-5 leading-relaxed">
              <li>{t("calendar.inbound.step1")}</li>
              <li>{t("calendar.inbound.step2")}</li>
              <li>
                {t("calendar.inbound.step3")}{" "}
                <code className="rounded bg-slate-100 px-1 font-mono">
                  offer OR &quot;purchase agreement&quot; OR &quot;listing agreement&quot; OR &quot;showing request&quot;
                </code>
              </li>
              <li>{t("calendar.inbound.step4")}</li>
              <li>
                {t("calendar.inbound.step5")}{" "}
                <code className="rounded bg-slate-100 px-1 font-mono">{alias.address}</code>
              </li>
              <li>{t("calendar.inbound.step6")}</li>
            </ol>
            <p className="mt-2 text-[11px] text-slate-500">{t("calendar.inbound.verifyNote")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3 text-[11px] text-slate-600">
            <span>{t("calendar.inbound.imported", { count: alias.inboundCount })}</span>
            {alias.lastReceivedAt && (
              <span>
                {t("calendar.inbound.lastReceived")}{" "}
                <time dateTime={alias.lastReceivedAt}>
                  {new Date(alias.lastReceivedAt).toLocaleString(timeLocale)}
                </time>
              </span>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
