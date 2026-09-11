import { describe, expect, it } from "vitest";
import {
  CLIENT_HEADER_ALIASES,
  EXPENSE_HEADER_ALIASES,
  canonicalHeaders,
  clientStatusFromCell,
  contactLanguageFromCell,
  normalizeHeader,
} from "@/lib/csv-headers";

describe("normalizeHeader", () => {
  it("ignores case, accents and spacing", () => {
    expect(normalizeHeader("  Correo Electrónico ")).toBe("correo_electronico");
    expect(normalizeHeader("Teléfono")).toBe("telefono");
    expect(normalizeHeader("first_name")).toBe("first_name");
  });
});

describe("canonicalHeaders", () => {
  it("maps a Spanish client sheet onto the columns the parser reads", () => {
    expect(
      canonicalHeaders(
        ["Nombre", "Apellidos", "Empresa", "Correo electrónico", "Teléfono", "Estado", "Etiquetas", "Notas", "Idioma"],
        CLIENT_HEADER_ALIASES,
      ),
    ).toEqual(["first_name", "last_name", "company", "email", "phone", "status", "tags", "notes", "language"]);
  });

  it("leaves the English template's own headers alone", () => {
    const english = ["first_name", "last_name", "company", "email", "phone", "status", "tags", "notes"];
    expect(canonicalHeaders(english, CLIENT_HEADER_ALIASES)).toEqual(english);
  });

  it("maps a Spanish expense sheet", () => {
    expect(canonicalHeaders(["Fecha", "Monto", "Descripción", "Categoría"], EXPENSE_HEADER_ALIASES)).toEqual([
      "date",
      "amount",
      "description",
      "category",
    ]);
  });
});

describe("clientStatusFromCell", () => {
  it("reads English and Spanish statuses", () => {
    expect(clientStatusFromCell("active")).toBe("active");
    expect(clientStatusFromCell("Activo")).toBe("active");
    expect(clientStatusFromCell("Contacto nuevo")).toBe("lead");
    expect(clientStatusFromCell("prospecto")).toBe("prospect");
    expect(clientStatusFromCell("Inactiva")).toBe("inactive");
  });

  it("returns null for what it does not recognise, so the caller picks the default", () => {
    expect(clientStatusFromCell("")).toBeNull();
    expect(clientStatusFromCell("vip")).toBeNull();
  });
});

describe("contactLanguageFromCell", () => {
  it("reads codes and names in several languages", () => {
    expect(contactLanguageFromCell("es")).toBe("es");
    expect(contactLanguageFromCell("Español")).toBe("es");
    expect(contactLanguageFromCell("English")).toBe("en");
    expect(contactLanguageFromCell("中文")).toBe("zh");
    expect(contactLanguageFromCell("zh-Hans")).toBe("zh");
  });

  it("returns null for an empty or unknown cell", () => {
    expect(contactLanguageFromCell("")).toBeNull();
    expect(contactLanguageFromCell("fr")).toBeNull();
  });
});
