import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { OrgSettingsForm } from "@/components/org-settings-form";
import { BankAccountMappingForm } from "@/components/bank-account-mapping-form";
import { VoiceAgentSettingsSection } from "@/components/voice-agent-settings-section";
import { SettingsTabs } from "@/components/settings-tabs";
import { SocialConnections } from "@/components/social-connections";
import { SocialAutopilotPanel } from "@/components/social-autopilot-panel";
import { PlaidLink } from "@/components/plaid-link";
import { BillingRatesForm } from "@/components/billing-rates-form";
import { ReceptionSettings } from "@/components/reception-settings";
import { NpiSetting } from "@/components/npi-setting";
import { SlackSettings } from "@/components/slack-settings";
import { InvoiceReminderSettings } from "@/components/invoice-reminder-settings";
import { LanguagePanel } from "@/components/language-panel";
import { getActivePack } from "@/lib/packs";
import { requirePermission } from "@/lib/rbac";
import { getServerLocale, getServerT } from "@/lib/i18n/server";
import { intlLocale } from "@leadsmart/i18n";
import { Users, ChevronRight } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("settings");
  return { title: t("meta.title") };
}

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
];

const SECTION_H2 = "text-sm font-semibold text-slate-700 mb-4 pb-2 border-b border-slate-200";

export default async function SettingsPage() {
  await requirePermission("settings.read");

  const t = await getServerT("settings");
  const locale = await getServerLocale();

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [{ data: org }, { data: bankAccounts }, { data: coaAccounts }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, entity_type, accounting_basis, currency, timezone, default_hourly_rate, default_labor_cost_rate, weekly_digest_enabled, owner_english_assist, plan, subscription_status, trial_ends_at, twilio_number, auto_reply, auto_reply_msg, npi, slack_webhook_url, slack_notify_new_lead, slack_notify_approval, slack_notify_missed_call, slack_notify_form_submission, auto_send_reminders, reminder_days_intervals, reminder_max_count")
      .eq("id", orgId)
      .single(),
    supabase
      .from("bank_accounts")
      .select("id, name, type, subtype, mask, coa_account_id, institution:bank_connections(institution_name)")
      .eq("organization_id", orgId)
      .eq("is_active", true),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name, type")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .in("type", ["asset", "liability"])
      .order("code"),
  ]);

  // Connected social channels for the Marketing tab (connect/disconnect live
  // here now). Tolerate the table not existing — degrade to "none connected".
  const tokensRes = await supabase
    .from("org_oauth_tokens")
    .select("provider")
    .eq("organization_id", orgId);
  const connectedProviders = (
    tokensRes.error ? [] : ((tokensRes.data as { provider: string }[]) ?? [])
  ).map((t) => t.provider);

  const isMedical = (await getActivePack()).id === "medical";

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{t("page.title")}</h1>
        <p className="text-sm text-slate-500 mt-0.5">{t("page.subtitle")}</p>
      </div>

      <SettingsTabs
        general={
          <>
            <LanguagePanel />

            <section>
              <h2 className={SECTION_H2}>{t("sections.businessInfo")}</h2>
              <OrgSettingsForm
                org={org}
                timezones={TIMEZONES}
                weeklyDigestEnabled={org?.weekly_digest_enabled ?? true}
                ownerEnglishAssist={org?.owner_english_assist ?? true}
              />
            </section>

            {isMedical && (
              <section>
                <h2 className={SECTION_H2}>{t("sections.insuranceEligibility")}</h2>
                <NpiSetting initial={org?.npi ?? ""} />
              </section>
            )}

            <section>
              <h2 className={SECTION_H2}>{t("sections.teamAndPlan")}</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Link
                  href="/settings/team"
                  className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4 hover:bg-white hover:border-slate-300 transition-colors group"
                >
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{t("teamPlan.membersTitle")}</p>
                    <p className="text-xs text-slate-500">{t("teamPlan.membersSubtitle")}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
                </Link>

                <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {t("teamPlan.planName", {
                        plan: t(`teamPlan.plans.${org?.plan ?? "starter"}`, {
                          defaultValue: org?.plan ?? "starter",
                        }),
                      })}
                    </p>
                    <p className="text-xs text-slate-500 truncate">
                      {t(`teamPlan.status.${org?.subscription_status ?? "trialing"}`, {
                        defaultValue: org?.subscription_status ?? "trialing",
                      })}
                      {org?.trial_ends_at && (
                        <>
                          {" · "}
                          {t("teamPlan.trialEnds", {
                            date: new Date(org.trial_ends_at).toLocaleDateString(intlLocale(locale), {
                              month: "short",
                              day: "numeric",
                            }),
                          })}
                        </>
                      )}
                    </p>
                  </div>
                  <span className="inline-block px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-100 rounded-full shrink-0">
                    {t("teamPlan.freeDuringBeta")}
                  </span>
                </div>
              </div>
            </section>
          </>
        }
        financial={
          <>
            <section>
              <h2 className={SECTION_H2}>{t("sections.bankAccounts")}</h2>
              <p className="text-xs text-slate-500 mb-4">{t("financial.bank.description")}</p>
              <div className="mb-4">
                <PlaidLink />
              </div>
              {bankAccounts?.length ? (
                <div className="space-y-3">
                  {bankAccounts.map((ba) => (
                    <BankAccountMappingForm key={ba.id} bankAccount={ba} coaAccounts={coaAccounts ?? []} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
                  {t("financial.bank.empty")}
                </div>
              )}
            </section>

            <section>
              <h2 className={SECTION_H2}>{t("sections.billingRates")}</h2>
              <BillingRatesForm
                hourlyRate={Number(org?.default_hourly_rate ?? 0) || null}
                laborCostRate={Number(org?.default_labor_cost_rate ?? 0) || null}
              />
            </section>

            <section>
              <h2 className={SECTION_H2}>{t("sections.invoiceReminders")}</h2>
              <InvoiceReminderSettings
                orgId={org?.id ?? ""}
                autoSend={org?.auto_send_reminders ?? true}
                daysIntervals={(org?.reminder_days_intervals as number[] | null) ?? [3, 7, 14, 30]}
                maxCount={org?.reminder_max_count ?? 4}
              />
            </section>
          </>
        }
        marketing={
          <>
            <section>
              <h2 className={SECTION_H2}>{t("sections.socialChannels")}</h2>
              <p className="text-xs text-slate-500 mb-4">{t("marketing.socialChannelsDescription")}</p>
              <SocialConnections connected={connectedProviders} />
            </section>

            <section>
              <h2 className={SECTION_H2}>{t("sections.socialAutopilot")}</h2>
              <p className="text-xs text-slate-500 mb-4">{t("marketing.socialAutopilotDescription")}</p>
              <SocialAutopilotPanel variant="full" />
            </section>
          </>
        }
        voice={
          <section id="voice-agent" className="scroll-mt-8">
            <h2 className={SECTION_H2}>{t("sections.voiceAgent")}</h2>
            <VoiceAgentSettingsSection />
          </section>
        }
        operations={
          <>
            <ReceptionSettings
              orgId={org?.id ?? ""}
              twilioNumber={org?.twilio_number ?? null}
              autoReply={org?.auto_reply ?? false}
              autoReplyMsg={org?.auto_reply_msg ?? "Hey! We missed your call. We'll get back to you shortly."}
            />

            <section>
              <h2 className={SECTION_H2}>{t("sections.slackNotifications")}</h2>
              <SlackSettings
                webhookUrl={org?.slack_webhook_url ?? null}
                notifyNewLead={org?.slack_notify_new_lead ?? true}
                notifyApproval={org?.slack_notify_approval ?? true}
                notifyMissedCall={org?.slack_notify_missed_call ?? true}
                notifyFormSubmission={org?.slack_notify_form_submission ?? true}
              />
            </section>
          </>
        }
      />
    </div>
  );
}
