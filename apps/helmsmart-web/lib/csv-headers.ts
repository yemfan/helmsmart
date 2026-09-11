/**
 * Spreadsheet column names and cell values → what a CSV importer stores.
 *
 * Owners export from whatever they already use, in the language they use it
 * in, so a Spanish sheet says "Teléfono" and "Activo", not "phone" and
 * "active". Both importers used to match only the English snake_case names,
 * so a Spanish sheet imported with every optional column silently empty and
 * every status silently "lead".
 *
 * Headers and values are compared without case, accents, or spacing, then
 * looked up in the alias tables below. The canonical names are still what the
 * templates download with and what the rest of the parser reads.
 *
 * Directive-free on purpose: the import forms are client components.
 */
import { CONTACT_LANGUAGES, type ContactLanguage } from "@/lib/i18n/contactLocale";

/** "Correo electrónico " → "correo_electronico". */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
}

/** A header row with every alias replaced by the canonical column name. */
export function canonicalHeaders(row: string[], aliases: Record<string, string>): string[] {
  return row.map((header) => {
    const normalized = normalizeHeader(header);
    return aliases[normalized] ?? normalized;
  });
}

export const CLIENT_HEADER_ALIASES: Record<string, string> = {
  nombre: "first_name",
  primer_nombre: "first_name",
  apellido: "last_name",
  apellidos: "last_name",
  empresa: "company",
  compania: "company",
  negocio: "company",
  correo: "email",
  correo_electronico: "email",
  e_mail: "email",
  telefono: "phone",
  celular: "phone",
  movil: "phone",
  estado: "status",
  etiquetas: "tags",
  notas: "notes",
  idioma: "language",
};

export const EXPENSE_HEADER_ALIASES: Record<string, string> = {
  fecha: "date",
  monto: "amount",
  importe: "amount",
  descripcion: "description",
  concepto: "description",
  categoria: "category",
  proveedor: "vendor",
};

export type ClientStatus = "lead" | "prospect" | "active" | "inactive";

const STATUS_ALIASES: Record<string, ClientStatus> = {
  lead: "lead",
  contacto_nuevo: "lead",
  nuevo: "lead",
  cliente_potencial: "lead",
  prospect: "prospect",
  prospecto: "prospect",
  active: "active",
  activo: "active",
  activa: "active",
  inactive: "inactive",
  inactivo: "inactive",
  inactiva: "inactive",
};

/** A status cell in English or Spanish, or null when it is empty or unknown. */
export function clientStatusFromCell(cell: string): ClientStatus | null {
  return STATUS_ALIASES[normalizeHeader(cell)] ?? null;
}

const LANGUAGE_ALIASES: Record<string, ContactLanguage> = {
  english: "en",
  ingles: "en",
  spanish: "es",
  espanol: "es",
  chinese: "zh",
  chino: "zh",
  "中文": "zh",
  "简体中文": "zh",
  "zh_hans": "zh",
};

/** A language cell ("es", "Español", "中文"…), or null when empty or unknown. */
export function contactLanguageFromCell(cell: string): ContactLanguage | null {
  const normalized = normalizeHeader(cell);
  if ((CONTACT_LANGUAGES as readonly string[]).includes(normalized)) return normalized as ContactLanguage;
  return LANGUAGE_ALIASES[normalized] ?? null;
}
