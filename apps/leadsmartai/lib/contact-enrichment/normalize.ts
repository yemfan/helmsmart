import type { LeadLike } from "./types";

export function normalizeEmail(email?: string | null) {
  if (!email) return null;
  const t = email.trim().toLowerCase();
  return t || null;
}

export function normalizePhone(phone?: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return digits.slice(1);
  return digits.length === 10 ? digits : digits || null;
}

export function normalizeAddress(address?: string | null) {
  if (!address) return null;
  return address
    .toLowerCase()
    .trim()
    .replace(/\./g, "")
    .replace(/\bstreet\b/g, "st")
    .replace(/\bavenue\b/g, "ave")
    .replace(/\broad\b/g, "rd")
    .replace(/\bdrive\b/g, "dr")
    .replace(/\blane\b/g, "ln")
    .replace(/\bcourt\b/g, "ct")
    .replace(/\bplace\b/g, "pl")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function displayPhone(lead: LeadLike): string | null {
  const p = (typeof lead.phone === "string" && lead.phone.trim()) || "";
  return p || null;
}

export function displayAddress(lead: LeadLike): string | null {
  const a = lead.property_address;
  return typeof a === "string" && a.trim() ? a.trim() : null;
}

export function calculateContactCompletenessScore(lead: LeadLike) {
  let score = 0;
  if (typeof lead.name === "string" && lead.name.trim()) score += 15;
  if (typeof lead.email === "string" && lead.email.trim()) score += 20;
  if (displayPhone(lead)) score += 20;
  if (displayAddress(lead)) score += 15;
  if (typeof lead.city === "string" && lead.city.trim()) score += 5;
  if (typeof lead.state === "string" && lead.state.trim()) score += 5;
  const zip = lead.zip_code ?? lead.zip;
  if (typeof zip === "string" && zip.trim()) score += 5;
  if (lead.birthday) score += 5;
  if (lead.home_purchase_date) score += 5;
  if (typeof lead.relationship_stage === "string" && lead.relationship_stage.trim()) score += 5;
  return Math.min(score, 100);
}
