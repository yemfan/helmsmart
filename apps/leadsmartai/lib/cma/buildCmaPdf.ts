import "server-only";

import { jsPDF } from "jspdf";

import { buildListingStrategyBands } from "./listingStrategy";
import type { CmaSnapshot } from "./types";

/**
 * Renders a multi-section CMA PDF the agent hands a seller as a
 * leave-behind / email attachment. Sections:
 *
 *   1. Header — title, subject address, agent identity
 *   2. Estimated value range (low / midpoint / high)
 *   3. Listing-strategy bands (aggressive / market / premium)
 *   4. Comparable sales table (one row per comp)
 *   5. Disclosure footer
 *
 * Mirrors lib/listing-offers/buildNetToSellerPdf.ts patterns:
 * jsPDF (already monorepo dep), helvetica family, Letter format,
 * returns a Uint8Array the route streams as application/pdf. No
 * external services. The file is server-only so the route's
 * runtime='nodejs' is enough — never bundles into the client.
 */

export type CmaPdfAgentIdentity = {
  name: string | null;
  brokerage: string | null;
  phone: string | null;
  email: string | null;
  licenseNumber: string | null;
};

export type BuildCmaPdfInput = {
  snapshot: CmaSnapshot;
  /** Optional override — when omitted we use snapshot.subject.address. */
  title: string | null;
  agent: CmaPdfAgentIdentity;
  /** ISO date string for the "generated on" footer line. Defaults to today. */
  generatedAtIso?: string;
};

const LEFT_MARGIN = 48;
const RIGHT_MARGIN_PADDING = 48;
const SECTION_LINE_LENGTH = 480;

export function buildCmaPdf(input: BuildCmaPdfInput): Uint8Array {
  const { snapshot, title, agent } = input;
  const generatedAt = input.generatedAtIso
    ? new Date(input.generatedAtIso)
    : new Date();

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const rightMargin = pageWidth - RIGHT_MARGIN_PADDING;
  let y = 56;

  // ── Header ─────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  const headerTitle = title?.trim() || "Comparative Market Analysis";
  doc.text(headerTitle, LEFT_MARGIN, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(60);
  doc.text(snapshot.subject.address || "—", LEFT_MARGIN, y);
  y += 14;

  // Subject characteristics inline.
  doc.setTextColor(120);
  doc.setFontSize(9);
  const subjLine = formatSubjectLine(snapshot);
  if (subjLine) {
    doc.text(subjLine, LEFT_MARGIN, y);
    y += 12;
  }

  // Agent identity (best-effort — blanks render as empty lines, not "—").
  const agentLine1: string[] = [];
  if (agent.name) agentLine1.push(agent.name);
  if (agent.brokerage) agentLine1.push(agent.brokerage);
  if (agent.licenseNumber) agentLine1.push(`Lic #${agent.licenseNumber}`);
  if (agentLine1.length) {
    doc.text(agentLine1.join(" · "), LEFT_MARGIN, y);
    y += 12;
  }
  const agentLine2 = [agent.phone, agent.email].filter(Boolean).join(" · ");
  if (agentLine2) {
    doc.text(agentLine2, LEFT_MARGIN, y);
    y += 12;
  }
  doc.setTextColor(0);
  y += 8;

  // ── Estimated value range ──────────────────────────────────────
  drawSectionHeader(doc, "Estimated value", LEFT_MARGIN, y);
  y += 18;

  const v = snapshot.valuation;
  const rangeRows: Array<[string, string]> = [
    ["Low", formatMoney(v.low)],
    ["Estimated", formatMoney(v.estimatedValue)],
    ["High", formatMoney(v.high)],
  ];
  if (v.avgPricePerSqft && v.avgPricePerSqft > 0) {
    rangeRows.push(["Avg comp $/sqft", formatMoney(v.avgPricePerSqft)]);
  }
  y = drawTable(doc, rangeRows, LEFT_MARGIN, rightMargin, y);
  y += 8;

  // ── Listing-strategy bands ─────────────────────────────────────
  drawSectionHeader(doc, "Listing strategies", LEFT_MARGIN, y);
  y += 18;

  const bands = buildListingStrategyBands(snapshot.strategies, snapshot.valuation);
  for (const band of bands) {
    if (y > pageHeight - 120) {
      doc.addPage();
      y = 56;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    const tag =
      band.expectedDom != null
        ? `${band.label} · ${band.expectedDom}d`
        : `${band.label} · est.`;
    doc.text(tag, LEFT_MARGIN, y);
    const priceText = formatMoney(band.price);
    doc.text(priceText, rightMargin - doc.getTextWidth(priceText), y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100);
    const wrapped = doc.splitTextToSize(band.rationale, SECTION_LINE_LENGTH);
    for (const line of wrapped) {
      doc.text(line, LEFT_MARGIN, y);
      y += 11;
    }
    doc.setTextColor(0);
    y += 6;
  }
  y += 4;

  // ── Comparable sales ────────────────────────────────────────────
  drawSectionHeader(doc, `Comparable sales (${snapshot.comps.length})`, LEFT_MARGIN, y);
  y += 18;

  if (snapshot.comps.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text("No comparable sales were available for this property.", LEFT_MARGIN, y);
    doc.setTextColor(0);
    y += 14;
  } else {
    // Column layout — keep consistent with the on-screen detail table.
    const cols = [
      { x: LEFT_MARGIN, label: "Address", align: "left" as const },
      { x: LEFT_MARGIN + 220, label: "Sold", align: "left" as const },
      { x: rightMargin - 230, label: "Price", align: "right" as const },
      { x: rightMargin - 130, label: "Sqft", align: "right" as const },
      { x: rightMargin - 60, label: "$/sqft", align: "right" as const },
      { x: rightMargin, label: "Distance", align: "right" as const },
    ];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(80);
    for (const c of cols) {
      drawCell(doc, c.label, c.x, y, c.align);
    }
    y += 12;
    doc.setDrawColor(220);
    doc.line(LEFT_MARGIN, y - 3, rightMargin, y - 3);
    doc.setTextColor(0);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    for (const comp of snapshot.comps) {
      if (y > pageHeight - 80) {
        doc.addPage();
        y = 56;
      }
      const addrText = truncate(comp.address, 36);
      drawCell(doc, addrText, cols[0].x, y, "left");
      drawCell(doc, comp.soldDate || "—", cols[1].x, y, "left");
      drawCell(doc, formatMoney(comp.price), cols[2].x, y, "right");
      drawCell(doc, comp.sqft ? comp.sqft.toLocaleString() : "—", cols[3].x, y, "right");
      drawCell(
        doc,
        comp.pricePerSqft ? `$${Math.round(comp.pricePerSqft)}` : "—",
        cols[4].x,
        y,
        "right",
      );
      drawCell(
        doc,
        Number.isFinite(comp.distanceMiles)
          ? `${comp.distanceMiles.toFixed(1)} mi`
          : "—",
        cols[5].x,
        y,
        "right",
      );
      y += 12;

      const subline = formatCompSubline(comp);
      if (subline) {
        doc.setTextColor(130);
        doc.setFontSize(8);
        doc.text(subline, LEFT_MARGIN, y);
        doc.setTextColor(0);
        doc.setFontSize(9);
        y += 11;
      }

      doc.setDrawColor(240);
      doc.line(LEFT_MARGIN, y - 1, rightMargin, y - 1);
      y += 4;
    }
  }

  // ── Footer / disclosure (always at the bottom of the LAST page) ─
  const footerY = pageHeight - 56;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(130);
  // Prefer the snapshot's own disclaimer (the AI-estimate wording) when set,
  // wrapped to the content width; otherwise the generic comps-engine wording.
  const disclaimerLines = snapshot.disclaimer
    ? (doc.splitTextToSize(snapshot.disclaimer, 500) as string[])
    : [
        "This analysis is an opinion of value based on recent comparable sales and is not an appraisal. Actual",
        "sale price depends on market timing, condition, presentation, and buyer demand at listing.",
      ];
  const disclosure = [...disclaimerLines, `Generated ${formatDate(generatedAt)} by LeadSmart AI.`];
  let dy = footerY;
  for (const line of disclosure) {
    doc.text(line, LEFT_MARGIN, dy);
    dy += 10;
  }
  doc.setTextColor(0);

  return new Uint8Array(doc.output("arraybuffer"));
}

// ── helpers ────────────────────────────────────────────────────────

function formatSubjectLine(s: CmaSnapshot): string {
  const subj = s.subject;
  const parts: string[] = [];
  if (subj.beds) parts.push(`${subj.beds} bed`);
  if (subj.baths) parts.push(`${subj.baths} bath`);
  if (subj.sqft) parts.push(`${subj.sqft.toLocaleString()} sqft`);
  if (subj.yearBuilt) parts.push(`built ${subj.yearBuilt}`);
  if (subj.condition) parts.push(subj.condition);
  return parts.join(" · ");
}

function formatCompSubline(comp: {
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
}): string {
  const parts: string[] = [];
  if (comp.beds != null) parts.push(`${comp.beds} bed`);
  if (comp.baths != null) parts.push(`${comp.baths} bath`);
  if (comp.propertyType) parts.push(comp.propertyType);
  return parts.join(" · ");
}

function drawSectionHeader(doc: jsPDF, title: string, x: number, y: number): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(50);
  doc.text(title.toUpperCase(), x, y);
  doc.setTextColor(0);
  doc.setDrawColor(200);
  doc.line(x, y + 4, x + SECTION_LINE_LENGTH, y + 4);
}

function drawTable(
  doc: jsPDF,
  rows: Array<[string, string]>,
  leftX: number,
  rightX: number,
  startY: number,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  let y = startY;
  for (const [label, value] of rows) {
    doc.setTextColor(100);
    doc.text(label, leftX, y);
    doc.setTextColor(0);
    const text = value ?? "—";
    const w = doc.getTextWidth(text);
    doc.text(text, rightX - w, y);
    y += 14;
  }
  return y;
}

function drawCell(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  align: "left" | "right",
): void {
  if (align === "right") {
    const w = doc.getTextWidth(text);
    doc.text(text, x - w, y);
  } else {
    doc.text(text, x, y);
  }
}

function formatMoney(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
