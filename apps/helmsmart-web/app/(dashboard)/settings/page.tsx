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
import { getActivePack } from "@/lib/packs";
import { requirePermission } from "@/lib/rbac";
import { Users, ChevronRight } from "lucide-react";

export const metadata: Metadata = { title: "Settings" };

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

  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [{ data: org }, { data: bankAccounts }, { data: coaAccounts }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, slug, name, entity_type, accounting_basis, currency, timezone, default_hourly_rate, default_labor_cost_rate, weekly_digest_enabled, owner_english_assist, plan, subscription_status, trial_ends_at, twilio_number, auto_reply, auto_reply_msg, npi, slack_webhook_url, slack_notify_new_lead, slack_notify_approval, slack_notify_missed_call, slack_notify_form_submission, auto_send_reminders, reminder_days_intervals, reminder_max_count")
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
        <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Manage your organization and integrations.</p>
      </div>

      <SettingsTabs
        general={
          <>
            <section>
              <h2 className={SECTION_H2}>Business information</h2>
              <OrgSettingsForm
                org={org}
                timezones={TIMEZONES}
                weeklyDigestEnabled={org?.weekly_digest_enabled ?? true}
                ownerEnglishAssist={org?.owner_english_assist ?? true}
              />
            </section>

            {isMedical && (
              <section>
                <h2 className={SECTION_H2}>Insurance eligibility</h2>
                <NpiSetting initial={org?.npi ?? ""} />
              </section>
            )}

            <section>
              <h2 className={SECTION_H2}>Team &amp; plan</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Link
                  href="/settings/team"
                  className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4 hover:bg-white hover:border-slate-300 transition-colors group"
                >
                  <div className="w-8 h-8 bg-indigo-100 rounded-lg flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Team members</p>
                    <p className="text-xs text-slate-500">Invite, roles, access</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors shrink-0" />
                </Link>

                <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-200 p-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 capitalize">{org?.plan ?? "Starter"} plan</p>
                    <p className="text-xs text-slate-500 capitalize truncate">
                      {org?.subscription_status ?? "trialing"}
                      {org?.trial_ends_at && (
                        <> · ends {new Date(org.trial_ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>
                      )}
                    </p>
                  </div>
                  <span className="inline-block px-2.5 py-1 text-[11px] font-semibold text-indigo-700 bg-indigo-100 rounded-full shrink-0">
                    Free during beta
                  </span>
                </div>
              </div>
            </section>
          </>
        }
        financial={
          <>
            <section>
              <h2 className={SECTION_H2}>Bank accounts</h2>
              <p className="text-xs text-slate-500 mb-4">
                Link a bank via Plaid to import the last 90 days of transactions (AI-categorized), then map
                each account to a chart-of-accounts entry so it posts to the double-entry journal.
              </p>
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
                  No bank accounts linked yet — click <strong>Link Bank</strong> above to connect one.
                </div>
              )}
            </section>

            <section>
              <h2 className={SECTION_H2}>Billing rates</h2>
              <BillingRatesForm
                hourlyRate={Number(org?.default_hourly_rate ?? 0) || null}
                laborCostRate={Number(org?.default_labor_cost_rate ?? 0) || null}
              />
            </section>

            <section>
              <h2 className={SECTION_H2}>Invoice payment reminders</h2>
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
              <h2 className={SECTION_H2}>Social channels</h2>
              <p className="text-xs text-slate-500 mb-4">
                Connect the accounts your AI marketing posts to. Connecting opens the
                provider&apos;s secure sign-in; disconnecting removes the stored access here.
              </p>
              <SocialConnections connected={connectedProviders} />
            </section>

            <section>
              <h2 className={SECTION_H2}>Social autopilot</h2>
              <p className="text-xs text-slate-500 mb-4">
                Turn it on and Emily writes &amp; schedules posts about your business on the
                cadence you choose.
              </p>
              <SocialAutopilotPanel variant="full" />
            </section>
          </>
        }
        voice={
          <section id="voice-agent" className="scroll-mt-8">
            <h2 className={SECTION_H2}>AI Voice agent</h2>
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
              <h2 className={SECTION_H2}>Slack notifications</h2>
              <SlackSettings
                webhookUrl={org?.slack_webhook_url ?? null}
                notifyNewLead={org?.slack_notify_new_lead ?? true}
                notifyApproval={org?.slack_notify_approval ?? true}
                notifyMissedCall={org?.slack_notify_missed_call ?? true}
                notifyFormSubmission={org?.slack_notify_form_submission ?? true}
              />
            </section>

            <section>
            <h2 className="text-sm font-semibold text-slate-700 mb-1 pb-2 border-b border-slate-200">
              Integrations & webhooks
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Configure these in your service dashboards so external events reach your app.
            </p>
            <div className="space-y-4">
              {/* Stripe */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-700 mb-3">Stripe</p>
                <div className="space-y-2">
                  {[
                    { label: "Webhook endpoint", path: "/api/stripe/webhook", note: "Events: checkout.session.completed" },
                  ].map(({ label, path, note }) => (
                    <div key={path}>
                      <p className="text-xs text-slate-500 mb-1">{label}</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-indigo-700 font-mono truncate">
                          {process.env.NEXT_PUBLIC_APP_URL}{path}
                        </code>
                      </div>
                      {note && <p className="text-[11px] text-slate-400 mt-1">{note}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Twilio */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-700 mb-3">Twilio</p>
                <div className="space-y-2">
                  {[
                    { label: "Voice — A call comes in", path: "/api/twilio/voice" },
                    { label: "Messaging — A message comes in", path: "/api/twilio/sms" },
                  ].map(({ label, path }) => (
                    <div key={path}>
                      <p className="text-xs text-slate-500 mb-1">{label}</p>
                      <code className="block text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-indigo-700 font-mono truncate">
                        {process.env.NEXT_PUBLIC_APP_URL}{path}
                      </code>
                    </div>
                  ))}
                </div>
              </div>

              {/* Email (Resend inbound) */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-700 mb-3">Email (Resend inbound)</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Webhook endpoint — event: email.received</p>
                    <code className="block text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-indigo-700 font-mono truncate">
                      {process.env.NEXT_PUBLIC_APP_URL}/api/resend/inbound
                    </code>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Forward your inbox to this address</p>
                    <code className="block text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-indigo-700 font-mono truncate">
                      {process.env.INBOUND_EMAIL_DOMAIN
                        ? `${org?.slug ?? "your-org"}@${process.env.INBOUND_EMAIL_DOMAIN}`
                        : "Set INBOUND_EMAIL_DOMAIN to enable inbound email"}
                    </code>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    In Gmail: Settings → Forwarding → add this address, then forward incoming mail to it. Set <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">RESEND_INBOUND_WEBHOOK_SECRET</code> to verify inbound webhooks.
                  </p>
                </div>
              </div>

              {/* Vercel Cron */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                <p className="text-xs font-semibold text-slate-700 mb-1">Vercel Cron</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-2">
                  Set <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">CRON_SECRET</code> in your Vercel environment variables to secure the cron endpoints.
                </p>
                <code className="block text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-600 font-mono">
                  GET {process.env.NEXT_PUBLIC_APP_URL}/api/cron/voice/reminders
                </code>
              </div>
            </div>
          </section>
          </>
        }
      />
    </div>
  );
}
