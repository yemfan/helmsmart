import { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/inbox-client";
import { inboundAddressFor } from "@/lib/inboundAddress";
import { getServerT } from "@/lib/i18n/server";
import { buildThreads, composeTarget, type MessageRow } from "@/lib/inbox/threads";
import { withConsent } from "@/lib/inbox/load";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("inbox");
  return { title: t("meta.title") };
}

type ClientRow = { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null };

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ compose?: string | string[] }>;
}) {
  const [t, params] = await Promise.all([getServerT("inbox"), searchParams]);
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  // The forwarding address is resolved here, on the server: INBOUND_EMAIL_DOMAIN
  // is not a NEXT_PUBLIC variable, so it does not exist in the client bundle.
  const { data: orgRow } = await supabase
    .from("organizations")
    .select("slug")
    .eq("id", orgId)
    .maybeSingle();
  const inboundAddress = inboundAddressFor(orgRow?.slug);

  // Load all messages for this org. `sent_by` says who sent each outbound one.
  const { data: rawMessages } = await supabase
    .from("messages")
    .select(`
      id, channel, direction, subject, body, sent_at, read, client_id, from_address, to_address, translation_en, intent, priority, sent_by,
      clients(id, first_name, last_name, email, phone)
    `)
    .eq("organization_id", orgId)
    .order("sent_at", { ascending: true });

  // Load all clients (for compose)
  const { data: clientRows } = await supabase
    .from("clients")
    .select("id, first_name, last_name, email, phone")
    .eq("organization_id", orgId)
    .order("last_name");
  const clients = (clientRows ?? []) as ClientRow[];

  // Who each conversation can still be reached on — decided the way the send
  // path decides it, so the header and a refusal never disagree.
  const threads = await withConsent(
    supabase,
    orgId,
    buildThreads((rawMessages ?? []) as unknown as MessageRow[], t("list.unknownSender")),
  );

  const compose = typeof params.compose === "string" ? composeTarget(params.compose, clients) : null;

  return (
    <InboxClient
      threads={threads}
      clients={clients}
      orgId={orgId}
      inboundAddress={inboundAddress}
      initialCompose={compose}
    />
  );
}
