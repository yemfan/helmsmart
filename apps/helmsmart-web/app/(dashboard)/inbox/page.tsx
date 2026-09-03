import { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { InboxClient } from "@/components/inbox-client";
import { inboundAddressFor } from "@/lib/inboundAddress";

export const metadata: Metadata = { title: "Inbox" };

export default async function InboxPage() {
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

  // Load all messages for this org
  const { data: rawMessages } = await supabase
    .from("messages")
    .select(`
      id, channel, direction, subject, body, sent_at, read, client_id, from_address, to_address, translation_en, intent, priority,
      clients(id, first_name, last_name, email, phone)
    `)
    .eq("organization_id", orgId)
    .order("sent_at", { ascending: true });

  // Load all clients (for compose)
  const { data: clients } = await supabase
    .from("clients")
    .select("id, first_name, last_name, email, phone")
    .eq("organization_id", orgId)
    .order("last_name");

  // Group messages into threads by client_id
  type RawMsg = NonNullable<typeof rawMessages>[number];
  type MsgForThread = {
    id: string;
    channel: "email" | "sms";
    direction: "inbound" | "outbound";
    subject: string | null;
    body: string;
    sent_at: string;
    read: boolean;
    translationEn: string | null;
    intent: string | null;
    priority: string | null;
  };
  type Thread = {
    key: string;
    clientId: string | null;
    contactAddress: string | null;
    clientName: string;
    clientEmail: string | null;
    clientPhone: string | null;
    lastMessage: MsgForThread;
    unreadCount: number;
    messages: MsgForThread[];
  };

  const threadMap = new Map<string, Thread>();

  for (const msg of rawMessages ?? []) {
    const clientsRaw = msg.clients;
    const clientRaw = (Array.isArray(clientsRaw) ? clientsRaw[0] : clientsRaw) as { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;

    // The external party's address — used to group senders not linked to a client,
    // so distinct unmatched senders no longer collapse into one "Unknown" thread.
    const contactAddress = (msg.direction === "inbound" ? msg.from_address : msg.to_address) ?? null;
    const key = msg.client_id ?? (contactAddress ? `addr:${contactAddress}` : "unknown");
    const isEmailAddr = !!contactAddress && contactAddress.includes("@");

    const clientName = clientRaw
      ? [clientRaw.first_name, clientRaw.last_name].filter(Boolean).join(" ") || "Unknown"
      : contactAddress ?? "Unknown";

    const m: MsgForThread = {
      id: msg.id,
      channel: msg.channel as "email" | "sms",
      direction: msg.direction as "inbound" | "outbound",
      subject: msg.subject,
      body: msg.body,
      sent_at: msg.sent_at,
      read: msg.read,
      translationEn: msg.translation_en,
      intent: msg.intent,
      priority: msg.priority,
    };

    const existing = threadMap.get(key);
    if (existing) {
      existing.messages.push(m);
      existing.lastMessage = m;
      if (!m.read && m.direction === "inbound") existing.unreadCount++;
    } else {
      threadMap.set(key, {
        key,
        clientId: msg.client_id ?? null,
        contactAddress: clientRaw ? null : contactAddress,
        clientName,
        clientEmail: clientRaw?.email ?? (isEmailAddr ? contactAddress : null),
        clientPhone: clientRaw?.phone ?? (isEmailAddr ? null : contactAddress),
        lastMessage: m,
        unreadCount: !m.read && m.direction === "inbound" ? 1 : 0,
        messages: [m],
      });
    }
  }

  // Sort threads: most recent first
  const threads = Array.from(threadMap.values()).sort(
    (a, b) => new Date(b.lastMessage.sent_at).getTime() - new Date(a.lastMessage.sent_at).getTime()
  );

  return (
    <InboxClient
      threads={threads}
      clients={(clients ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null }[]}
      orgId={orgId}
      inboundAddress={inboundAddress}
    />
  );
}
