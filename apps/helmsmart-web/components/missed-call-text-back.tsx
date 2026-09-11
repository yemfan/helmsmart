import { Settings } from "lucide-react";
import { RoiCounter } from "@/components/roi-counter";
import { getServerT } from "@/lib/i18n/server";

/**
 * Missed-call text-back — the inbound safety net: when a call isn't served, the
 * caller gets an automatic text. Shows whether it is on and what it did over
 * the page's reporting window. The calls themselves are listed once, in the
 * page's Recent calls list, not here. Settings live under /settings#operations.
 */
export async function MissedCallTextBack({
  org,
  missed,
  autoTexted,
  bookedViaSms,
  periodDays,
}: {
  org: { twilio_number: string | null; auto_reply: boolean | null } | null;
  missed: number | null;
  autoTexted: number | null;
  bookedViaSms: number | null;
  periodDays: number;
}) {
  const t = await getServerT("voice");
  const number = org?.twilio_number?.trim() || null;

  const status = !org?.auto_reply
    ? { text: t("missedCall.off"), tone: "text-amber-700" }
    : number
      ? { text: t("missedCall.on", { number }), tone: "text-slate-600" }
      : { text: t("missedCall.onNoNumber"), tone: "text-amber-700" };

  return (
    <section>
      <div className="flex items-center justify-between mb-1 gap-4">
        <h2 className="text-sm font-semibold text-slate-700">{t("missedCall.title")}</h2>
        <a
          href="/settings#operations"
          className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors shrink-0"
        >
          <Settings className="w-3.5 h-3.5" />
          {t("missedCall.settingsLink")}
        </a>
      </div>
      <p className={`text-sm mb-4 ${status.tone}`}>{status.text}</p>

      <RoiCounter missed={missed} autoTexted={autoTexted} bookedViaSms={bookedViaSms} periodDays={periodDays} />
    </section>
  );
}
