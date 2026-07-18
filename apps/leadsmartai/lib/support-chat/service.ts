import { randomUUID } from "node:crypto";

import { supabaseAdmin } from "@/lib/supabase/admin";

/** DB row shape from Supabase (snake_case). */
type ConversationRow = {
  id: string;
  public_id: string;
  customer_name: string;
  customer_email: string;
  customer_user_id: string | null;
  subject: string | null;
  status: string;
  priority: string;
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  source: string | null;
  last_message_at: string | null;
  last_message_by: string | null;
  unread_for_customer: number;
  unread_for_support: number;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_name: string | null;
  sender_email: string | null;
  body: string;
  message_type: string;
  is_internal_note: boolean;
  metadata: unknown;
  created_at: string;
};

export type SupportChatMessage = {
  id: string;
  conversationId: string;
  senderType: string;
  senderName: string | null;
  senderEmail: string | null;
  body: string;
  messageType: string;
  isInternalNote: boolean;
  metadata: unknown;
  createdAt: Date;
};

export type SupportChatConversation = {
  id: string;
  publicId: string;
  customerName: string;
  customerEmail: string;
  customerUserId: string | null;
  subject: string | null;
  status: string;
  priority: string;
  assignedAgentId: string | null;
  assignedAgentName: string | null;
  source: string | null;
  lastMessageAt: Date | null;
  lastMessageBy: string | null;
  unreadForCustomer: number;
  unreadForSupport: number;
  createdAt: Date;
  updatedAt: Date;
  messages: SupportChatMessage[];
};

function mapMessageRow(row: MessageRow): SupportChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderType: row.sender_type,
    senderName: row.sender_name,
    senderEmail: row.sender_email,
    body: row.body,
    messageType: row.message_type,
    isInternalNote: row.is_internal_note,
    metadata: row.metadata ?? null,
    createdAt: new Date(row.created_at),
  };
}

function mapConversationRow(
  row: ConversationRow,
  messages: MessageRow[] = []
): SupportChatConversation {
  return {
    id: row.id,
    publicId: row.public_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerUserId: row.customer_user_id,
    subject: row.subject,
    status: row.status,
    priority: row.priority,
    assignedAgentId: row.assigned_agent_id,
    assignedAgentName: row.assigned_agent_name,
    source: row.source,
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at) : null,
    lastMessageBy: row.last_message_by,
    unreadForCustomer: row.unread_for_customer ?? 0,
    unreadForSupport: row.unread_for_support ?? 0,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    messages: messages.map(mapMessageRow),
  };
}

function publicId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 18);
}

export type CreateConversationInput = {
  customerName: string;
  customerEmail: string;
  subject?: string;
  initialMessage: string;
  source?: string;
};

export async function createConversation(
  input: CreateConversationInput
): Promise<SupportChatConversation> {
  const publicIdValue = publicId();

  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("support_conversations")
    .insert({
      public_id: publicIdValue,
      customer_name: input.customerName,
      customer_email: input.customerEmail,
      subject: input.subject,
      source: input.source ?? "website_chat",
      status: "open",
      priority: "normal",
      last_message_at: new Date().toISOString(),
      last_message_by: "customer",
      unread_for_support: 1,
      unread_for_customer: 0,
    })
    .select()
    .single();

  if (conversationError) throw conversationError;

  const conv = conversation as ConversationRow;

  const { error: messageError } = await supabaseAdmin.from("support_messages").insert({
    conversation_id: conv.id,
    sender_type: "customer",
    sender_name: input.customerName,
    sender_email: input.customerEmail,
    body: input.initialMessage,
    message_type: "text",
  });

  if (messageError) throw messageError;

  const full = await getConversationByPublicId(publicIdValue);
  if (!full) throw new Error("Failed to load conversation after create");
  return full;
}

export async function getConversationByPublicId(
  conversationPublicId: string
): Promise<SupportChatConversation | null> {
  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("support_conversations")
    .select("*")
    .eq("public_id", conversationPublicId)
    .maybeSingle();

  if (conversationError) throw conversationError;
  if (!conversation) return null;

  const conv = conversation as ConversationRow;

  const { data: messages, error: messagesError } = await supabaseAdmin
    .from("support_messages")
    .select("*")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });

  if (messagesError) throw messagesError;

  return mapConversationRow(conv, (messages ?? []) as MessageRow[]);
}

export async function listConversations(params?: {
  status?: string;
  assignedAgentId?: string;
  customerEmail?: string;
  limit?: number;
}): Promise<SupportChatConversation[]> {
  let query = supabaseAdmin
    .from("support_conversations")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(params?.limit ?? 50);

  // `status` is a Postgres enum — the dashboard's "All" tab sends the sentinel
  // "all", which is NOT a valid enum value; passing it to .eq() throws 22P02
  // ("invalid input value for enum") and 500s the whole list. Treat "all"
  // (and empty) as "no status filter".
  if (params?.status && params.status !== "all") query = query.eq("status", params.status);
  if (params?.assignedAgentId) query = query.eq("assigned_agent_id", params.assignedAgentId);
  if (params?.customerEmail) query = query.eq("customer_email", params.customerEmail);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ConversationRow[]).map((row) => mapConversationRow(row, []));
}

export type AddMessageInput = {
  conversationPublicId: string;
  senderType: "customer" | "support" | "system" | "ai";
  senderName?: string;
  senderEmail?: string;
  body: string;
  isInternalNote?: boolean;
};

function nextUnreadAndStatus(
  conversation: ConversationRow,
  senderType: AddMessageInput["senderType"]
): { nextStatus: string; unread_for_support: number; unread_for_customer: number } {
  const uS = conversation.unread_for_support ?? 0;
  const uC = conversation.unread_for_customer ?? 0;

  if (senderType === "customer") {
    return {
      nextStatus: "waiting_on_support",
      unread_for_support: uS + 1,
      unread_for_customer: 0,
    };
  }
  if (senderType === "support" || senderType === "ai") {
    return {
      nextStatus: "waiting_on_customer",
      unread_for_support: 0,
      unread_for_customer: uC + 1,
    };
  }
  return {
    nextStatus: conversation.status,
    unread_for_support: 0,
    unread_for_customer: 0,
  };
}

export async function addMessage(input: AddMessageInput): Promise<SupportChatMessage> {
  const { data: conversation, error: conversationError } = await supabaseAdmin
    .from("support_conversations")
    .select("*")
    .eq("public_id", input.conversationPublicId)
    .maybeSingle();

  if (conversationError) throw conversationError;
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const conv = conversation as ConversationRow;

  if (
    (conv.status === "closed" || conv.status === "resolved") &&
    input.senderType === "customer" &&
    !(input.isInternalNote ?? false)
  ) {
    throw new Error("CONVERSATION_CLOSED");
  }

  const { data: message, error: messageError } = await supabaseAdmin
    .from("support_messages")
    .insert({
      conversation_id: conv.id,
      sender_type: input.senderType,
      sender_name: input.senderName,
      sender_email: input.senderEmail,
      body: input.body,
      is_internal_note: input.isInternalNote ?? false,
      message_type: "text",
    })
    .select()
    .single();

  if (messageError) throw messageError;

  const msgRow = message as MessageRow;
  const { nextStatus, unread_for_support, unread_for_customer } = nextUnreadAndStatus(
    conv,
    input.senderType
  );

  const { error: updateError } = await supabaseAdmin
    .from("support_conversations")
    .update({
      last_message_at: msgRow.created_at,
      last_message_by: input.senderType,
      unread_for_support,
      unread_for_customer,
      status: nextStatus,
    })
    .eq("id", conv.id);

  if (updateError) throw updateError;

  return mapMessageRow(msgRow);
}

export type UpdateConversationInput = {
  conversationPublicId: string;
  status?: string;
  priority?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
};

export async function updateConversation(
  input: UpdateConversationInput
): Promise<SupportChatConversation> {
  const { data: existing, error: findError } = await supabaseAdmin
    .from("support_conversations")
    .select("id")
    .eq("public_id", input.conversationPublicId)
    .maybeSingle();

  if (findError) throw findError;
  if (!existing) {
    throw new Error("Conversation not found");
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.status !== undefined) patch.status = input.status;
  if (input.priority !== undefined) patch.priority = input.priority;
  if (input.assignedAgentId !== undefined) patch.assigned_agent_id = input.assignedAgentId;
  if (input.assignedAgentName !== undefined) patch.assigned_agent_name = input.assignedAgentName;

  const { error } = await supabaseAdmin
    .from("support_conversations")
    .update(patch)
    .eq("public_id", input.conversationPublicId);

  if (error) throw error;

  const { data: row, error: loadError } = await supabaseAdmin
    .from("support_conversations")
    .select("*")
    .eq("public_id", input.conversationPublicId)
    .single();

  if (loadError) throw loadError;
  return mapConversationRow(row as ConversationRow, []);
}

export type MarkConversationReadInput = {
  conversationPublicId: string;
  readerType: "customer" | "support";
};

export async function markConversationRead(
  input: MarkConversationReadInput
): Promise<SupportChatConversation> {
  const { data: existing, error: findError } = await supabaseAdmin
    .from("support_conversations")
    .select("id")
    .eq("public_id", input.conversationPublicId)
    .maybeSingle();

  if (findError) throw findError;
  if (!existing) {
    throw new Error("Conversation not found");
  }

  const field =
    input.readerType === "customer" ? "unread_for_customer" : "unread_for_support";

  const { error } = await supabaseAdmin
    .from("support_conversations")
    .update({
      [field]: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("public_id", input.conversationPublicId);

  if (error) throw error;

  const { data: row, error: loadError } = await supabaseAdmin
    .from("support_conversations")
    .select("*")
    .eq("public_id", input.conversationPublicId)
    .single();

  if (loadError) throw loadError;
  return mapConversationRow(row as ConversationRow, []);
}
