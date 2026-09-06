import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getServerT } from "@/lib/i18n/server";

type ChannelStatus = {
  sms: {
    number: string | null;
    verified: boolean | null;
    tenDlcRegistered: boolean | null;
  };
  email: {
    address: string | null;
    verified: boolean | null;
    dkim: boolean | null;
    spf: boolean | null;
    dmarc: boolean | null;
  };
};

/**
 * Read sender verification status. The spec says "data source: whatever
 * provider handles 10DLC and DKIM/SPF today (Twilio + SendGrid?)". Until a
 * provider integration writes back to an `agent_channel_status` table, we
 * surface what's derivable (auth email) + TODO markers for the rest.
 */
async function loadChannelStatus(_agentId: string): Promise<ChannelStatus> {
  const fallback: ChannelStatus = {
    sms: { number: null, verified: null, tenDlcRegistered: null },
    email: { address: null, verified: null, dkim: null, spf: null, dmarc: null },
  };

  try {
    const supabase = supabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    const authEmail = userData?.user?.email ?? null;

    // TODO: when user_profiles.phone_e164 lands for the current agent, read it here.
    const { data: profile } = await supabaseAdmin
      .from("user_profiles")
      .select("phone, email")
      .eq("id", userData?.user?.id as never)
      .maybeSingle();

    const phone = profile ? ((profile as { phone?: string | null }).phone ?? null) : null;

    return {
      sms: {
        number: phone,
        verified: phone ? null : null, // TODO: Twilio verified number registry
        tenDlcRegistered: null, // TODO: Twilio 10DLC campaign status
      },
      email: {
        address: authEmail,
        verified: authEmail ? true : null,
        dkim: null, // TODO: SendGrid domain auth
        spf: null,
        dmarc: null,
      },
    };
  } catch {
    return fallback;
  }
}

export default async function ChannelsCard({ agentId: _agentId }: { agentId: string }) {
  const t = await getServerT("dashboard");
  const s = await loadChannelStatus(_agentId);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("pages.channelsCard.title")}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{t("pages.channelsCard.sub")}</p>

      <div className="mt-4 space-y-4">
        <ChannelBlock
          badge="SMS"
          value={s.sms.number ?? t("pages.channelsCard.noNumber")}
          subtitle={t("pages.channelsCard.smsSubtitle")}
          rows={[
            {
              state: s.sms.verified === true ? "ok" : s.sms.verified === false ? "warn" : "pending",
              label:
                s.sms.verified === true
                  ? "Number verified"
                  : s.sms.verified === false
                    ? "Number not verified"
                    : "Verification status unavailable",
              hint: s.sms.verified === null ? "Provider integration TODO." : undefined,
            },
            {
              state: s.sms.tenDlcRegistered === true ? "ok" : s.sms.tenDlcRegistered === false ? "warn" : "pending",
              label:
                s.sms.tenDlcRegistered === true
                  ? "10DLC registered"
                  : s.sms.tenDlcRegistered === false
                    ? "10DLC registration pending"
                    : "10DLC status unavailable",
              hint: s.sms.tenDlcRegistered === null ? "Provider integration TODO." : undefined,
            },
            {
              state: "ok",
              label: "Opt-out keywords · EN: STOP, UNSUBSCRIBE · 中文: 停止, 退订",
            },
          ]}
        />

        <ChannelBlock
          badge="@"
          badgeTone="email"
          value={s.email.address ?? t("pages.channelsCard.noEmail")}
          subtitle={t("pages.channelsCard.emailSubtitle")}
          rows={[
            {
              state: s.email.verified === true ? "ok" : s.email.verified === false ? "warn" : "pending",
              label:
                s.email.verified === true
                  ? "Address verified"
                  : s.email.verified === false
                    ? "Address not verified"
                    : "Verification status unavailable",
            },
            { state: dotState(s.email.dkim), label: s.email.dkim === null ? "DKIM status unavailable" : s.email.dkim ? "DKIM" : "DKIM missing" },
            { state: dotState(s.email.spf), label: s.email.spf === null ? "SPF status unavailable" : s.email.spf ? "SPF" : "SPF missing" },
            {
              state: dotState(s.email.dmarc, "warn"),
              label: s.email.dmarc === null ? "DMARC status unavailable" : s.email.dmarc ? "DMARC" : "DMARC not configured",
              hint: s.email.dmarc === false ? "Deliverability may suffer for large sends." : undefined,
            },
          ]}
        />
      </div>

      <p className="mt-4 text-[11px] text-slate-400">{t("pages.channelsCard.readOnly")}</p>
    </div>
  );
}

function dotState(v: boolean | null, missingState: "pending" | "warn" = "warn"): "ok" | "warn" | "pending" {
  if (v === true) return "ok";
  if (v === false) return missingState;
  return "pending";
}

function ChannelBlock({
  badge,
  badgeTone,
  value,
  subtitle,
  rows,
}: {
  badge: string;
  badgeTone?: "sms" | "email";
  value: string;
  subtitle: string;
  rows: { state: "ok" | "warn" | "pending"; label: string; hint?: string }[];
}) {
  const badgeCls =
    badgeTone === "email" ? "bg-violet-100 text-violet-700" : "bg-blue-100 text-blue-700";
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg text-xs font-bold ${badgeCls}`}
        >
          {badge}
        </span>
        <div className="flex-1 min-w-0">
          <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{value}</div>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span
              aria-hidden
              className={`mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full ${
                r.state === "ok"
                  ? "bg-green-500"
                  : r.state === "warn"
                    ? "bg-amber-500"
                    : "bg-slate-300"
              }`}
            />
            <span className="text-slate-700 dark:text-slate-300">
              {r.label}
              {r.hint && <span className="text-slate-400"> — {r.hint}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
