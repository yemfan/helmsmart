import type { LeadLike } from "@/lib/contact-enrichment/types";

import type { ContactFieldsInput } from "./types";
import { formatUsPhoneDigits } from "./phone";

export function toLeadLike(fields: ContactFieldsInput, agentId: string): LeadLike {
  const phone = formatUsPhoneDigits(fields.phone ?? "") ?? fields.phone?.trim() ?? null;
  return {
    id: "incoming",
    agent_id: agentId,
    name: fields.name ?? null,
    email: fields.email ?? null,
    phone,
    property_address: fields.property_address ?? null,
    notes: fields.notes ?? null,
  };
}
