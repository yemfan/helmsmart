import "server-only";

import { jsPDF } from "jspdf";

import { buildListingStrategyBands } from "./listingStrategy";
import type { CmaPdfAgentIdentity } from "./buildCmaPdf";
import type { SubjectPhoto } from "./streetViewPhoto";
import type { CmaCompRow, CmaSnapshot } from "./types";

/**
 * Professional, presentation-grade CMA report — the deliverable an
 * agent hands a seller. Distinct from buildCmaPdf (the plain quick
 * export): branded cover with a single property photo, hero value
 * range, listing strategies, full comp table, cited sources, and a
 * disclosure footer on every page.
 *
 * jsPDF (already a monorepo dep), helvetica family, Letter format,
 * server-only so the route's runtime='nodejs' keeps it off the client.
 * The subject photo is optional — pass null and the cover lays out a
 * clean placeholder band instead.
 */

export type BuildCmaReportPdfInput = {
  snapshot: CmaSnapshot;
  title: string | null;
  agent: CmaPdfAgentIdentity;
  /** Street View photo of the subject; null when unavailable. */
  photo: SubjectPhoto | null;
  /** ISO date for the "prepared on" line. Defaults to today. */
  generatedAtIso?: string;
};

// Brand accent — emerald, matching the dashboard's "Estimated" treatment.
const ACCENT: [number, number, number] = [4, 120, 87]; // emerald-700
const INK: [number, number, number] = [15, 23, 42]; // slate-900
const MUTE: [number, number, number] = [100, 116, 139]; // slate-500

const MARGIN = 48;

export function buildCmaReportPdf(input: BuildCmaReportPdfInput): Uint8Array {
  const { snapshot, title, agent, photo } = input;
  const generatedAt = input.generatedAtIso
    ? new Date(input.generatedAtIso)
    : new Date();

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - MARGIN * 2;
  const right = pageW - MARGIN;

  // ── Cover header band ──────────────────────────────────────────
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, pageW, 96, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Comparative Market Analysis", MARGIN, 46);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(title?.trim() || snapshot.subject.address || "—", MARGIN, 68);
  // Brand mark (top-right).
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const brand = "LeadSmart AI";
  doc.text(brand, right - doc.getTextWidth(brand), 46);

  let y = 124;

  // ── Property photo ─────────────────────────────────────────────
  const photoH = 220;
  if (photo) {
    try {
      doc.addImage(photo.dataUrl, photo.format, MARGIN, y, contentW, photoH);
    } catch {
      drawPhotoPlaceholder(doc, MARGIN, y, contentW, photoH);
    }
  } else {
    drawPhotoPlaceholder(doc, MARGIN, y, contentW, photoH);
  }
  y += photoH + 18;

  // Subject address + characteristics under the photo.
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(snapshot.subject.address || "—", MARGIN, y);
  y += 16;
  const subjLine = formatSubjectLine(snapshot);
  if (subjLine) {
    doc.setTextColor(...MUTE);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(subjLine, MARGIN, y);
    y += 16;
  }
  y += 6;

  // ── Hero value range (three boxes) ─────────────────────────────
  const v = snapshot.valuation;
  const boxGap = 12;
  const boxW = (contentW - boxGap * 2) / 3;
  const boxH = 76;
  const boxes: Array<[string, number | null, boolean]> = [
    ["LOW", v.low, false],
    ["ESTIMATED", v.estimatedValue, true],
    ["HIGH", v.high, false],
  ];
  boxes.forEach(([label, val, emphasize], i) => {
    const bx = MARGIN + i * (boxW + boxGap);
    doc.setDrawColor(226, 232, 240); // slate-200
    if (emphasize) {
      doc.setFillColor(236, 253, 245); // emerald-50
      doc.roundedRect(bx, y, boxW, boxH, 8, 8, "FD");
    } else {
      doc.setFillColor(248, 250, 252); // slate-50
      doc.roundedRect(bx, y, boxW, boxH, 8, 8, "FD");
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTE);
    doc.text(label, bx + 14, y + 22);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    if (emphasize) doc.setTextColor(...ACCENT);
    else doc.setTextColor(...INK);
    doc.text(formatMoney(val), bx + 14, y + 52);
  });
  y += boxH + 10;

  if (v.avgPricePerSqft && v.avgPricePerSqft > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTE);
    doc.text(
      `Based on an average comp price of ${formatMoney(v.avgPricePerSqft)}/sqft.`,
      MARGIN,
      y,
    );
    y += 14;
  }
  y += 6;

  // Agent identity card.
  y = drawAgentCard(doc, agent, MARGIN, right, contentW, y);
  y += 8;

  // ── Listing strategies ─────────────────────────────────────────
  y = ensureSpace(doc, pageH, y, 120);
  y = sectionHeader(doc, "Listing strategies", MARGIN, contentW, y);
  const bands = buildListingStrategyBands(snapshot.strategies, snapshot.valuation);
  for (const band of bands) {
    y = ensureSpace(doc, pageH, y, 64);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    const tag =
      band.expectedDom != null
        ? `${band.label} · ${band.expectedDom}d on market`
        : band.label;
    doc.text(tag, MARGIN, y);
    const price = formatMoney(band.price);
    doc.setTextColor(...ACCENT);
    doc.text(price, right - doc.getTextWidth(price), y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTE);
    for (const line of doc.splitTextToSize(band.rationale, contentW) as string[]) {
      doc.text(line, MARGIN, y);
      y += 11;
    }
    y += 8;
  }
  y += 4;

  // ── Comparable sales ───────────────────────────────────────────
  y = ensureSpace(doc, pageH, y, 100);
  y = sectionHeader(doc, `Comparable sales (${snapshot.comps.length})`, MARGIN, contentW, y);
  y = drawCompTable(doc, snapshot.comps, MARGIN, right, pageH, y);
  y += 8;

  // ── Sources ────────────────────────────────────────────────────
  const sources = snapshot.sources ?? [];
  if (sources.length > 0) {
    y = ensureSpace(doc, pageH, y, 60);
    y = sectionHeader(doc, "Sources", MARGIN, contentW, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTE);
    for (const s of sources.slice(0, 12)) {
      y = ensureSpace(doc, pageH, y, 24);
      const label = s.title?.trim() || s.url;
      for (const line of doc.splitTextToSize(`• ${label}`, contentW) as string[]) {
        doc.text(line, MARGIN, y);
        y += 10;
      }
      doc.setTextColor(...ACCENT);
      for (const line of doc.splitTextToSize(`  ${s.url}`, contentW) as string[]) {
        doc.text(line, MARGIN, y);
        y += 10;
      }
      doc.setTextColor(...MUTE);
      y += 3;
    }
  }

  // ── Disclosure footer on every page ────────────────────────────
  stampFooters(doc, snapshot, generatedAt, MARGIN, pageW, pageH);

  return new Uint8Array(doc.output("arraybuffer"));
}

// ── sections / helpers ─────────────────────────────────────────────

function drawAgentCard(
  doc: jsPDF,
  agent: CmaPdfAgentIdentity,
  leftX: number,
  rightX: number,
  contentW: number,
  y: number,
): number {
  const line1 = [agent.name, agent.brokerage, agent.licenseNumber ? `Lic #${agent.licenseNumber}` : null]
    .filter(Boolean)
    .join(" · ");
  const line2 = [agent.phone, agent.email].filter(Boolean).join(" · ");
  if (!line1 && !line2) return y;

  const cardH = line1 && line2 ? 48 : 32;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(leftX, y, contentW, cardH, 8, 8, "FD");
  let ty = y + 20;
  if (line1) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(line1, leftX + 14, ty);
    ty += 14;
  }
  if (line2) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTE);
    doc.text(line2, leftX + 14, ty);
  }
  return y + cardH;
}

function drawCompTable(
  doc: jsPDF,
  comps: CmaCompRow[],
  leftX: number,
  rightX: number,
  pageH: number,
  startY: number,
): number {
  let y = startY;
  if (comps.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...MUTE);
    doc.text("No comparable sales were available for this property.", leftX, y);
    doc.setTextColor(...INK);
    return y + 14;
  }

  // Right-anchored numeric columns; address flows from the left.
  const cols = {
    address: leftX,
    sold: leftX + 196,
    lot: rightX - 250,
    hoa: rightX - 188,
    sqft: rightX - 130,
    ppsf: rightX - 64,
    price: rightX,
  };

  const header = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTE);
    doc.text("Address", cols.address, y);
    doc.text("Sold", cols.sold, y);
    cellRight(doc, "Lot", cols.lot, y);
    cellRight(doc, "HOA", cols.hoa, y);
    cellRight(doc, "Sqft", cols.sqft, y);
    cellRight(doc, "$/sqft", cols.ppsf, y);
    cellRight(doc, "Price", cols.price, y);
    y += 11;
    doc.setDrawColor(...ACCENT);
    doc.line(leftX, y - 3, rightX, y - 3);
    doc.setTextColor(...INK);
  };
  header();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  for (const c of comps) {
    if (y > pageH - 80) {
      doc.addPage();
      y = 56;
      header();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
    }
    doc.setTextColor(...INK);
    doc.text(truncate(c.address, 30), cols.address, y);
    doc.text(c.soldDate || "—", cols.sold, y);
    cellRight(doc, formatLot(c.lotSizeSqft, c.propertyType), cols.lot, y);
    cellRight(doc, formatHoa(c.hoaMonthly), cols.hoa, y);
    cellRight(doc, c.sqft ? c.sqft.toLocaleString() : "—", cols.sqft, y);
    cellRight(doc, c.pricePerSqft ? `$${Math.round(c.pricePerSqft)}` : "—", cols.ppsf, y);
    cellRight(doc, formatMoney(c.price), cols.price, y);
    y += 12;

    const sub = compSubline(c);
    if (sub) {
      doc.setTextColor(...MUTE);
      doc.setFontSize(8);
      doc.text(sub, cols.address, y);
      doc.setFontSize(9);
      y += 11;
    }
    doc.setDrawColor(240, 240, 240);
    doc.line(leftX, y - 1, rightX, y - 1);
    y += 4;
  }
  return y;
}

function stampFooters(
  doc: jsPDF,
  snapshot: CmaSnapshot,
  generatedAt: Date,
  leftX: number,
  pageW: number,
  pageH: number,
): void {
  const disclaimerLines = snapshot.disclaimer
    ? (doc.splitTextToSize(snapshot.disclaimer, pageW - leftX * 2) as string[])
    : [
        "This analysis is an opinion of value based on recent comparable sales and is not an appraisal.",
      ];
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(226, 232, 240);
    doc.line(leftX, pageH - 52, pageW - leftX, pageH - 52);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(...MUTE);
    let dy = pageH - 40;
    for (const line of disclaimerLines) {
      doc.text(line, leftX, dy);
      dy += 9;
    }
    const stamp = `Prepared ${formatDate(generatedAt)} by LeadSmart AI · Page ${p} of ${pages}`;
    doc.text(stamp, leftX, pageH - 18);
  }
}

function drawPhotoPlaceholder(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  doc.setFillColor(241, 245, 249); // slate-100
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(x, y, w, h, 8, 8, "FD");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTE);
  const msg = "Property photo unavailable";
  doc.text(msg, x + w / 2 - doc.getTextWidth(msg) / 2, y + h / 2);
}

function sectionHeader(
  doc: jsPDF,
  title: string,
  x: number,
  contentW: number,
  y: number,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(title, x, y);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1.5);
  doc.line(x, y + 5, x + 36, y + 5);
  doc.setLineWidth(1);
  return y + 22;
}

function ensureSpace(doc: jsPDF, pageH: number, y: number, needed: number): number {
  if (y > pageH - needed) {
    doc.addPage();
    return 56;
  }
  return y;
}

const isCondo = (t: string | null | undefined): boolean => !!t && /condo|town/i.test(t);

function formatLot(lotSizeSqft: number | null | undefined, propertyType: string | null): string {
  if (isCondo(propertyType)) return "—";
  if (lotSizeSqft == null || !Number.isFinite(lotSizeSqft) || lotSizeSqft <= 0) return "—";
  if (lotSizeSqft >= 43560) return `${(lotSizeSqft / 43560).toFixed(2)} ac`;
  return `${Math.round(lotSizeSqft).toLocaleString()} sf`;
}

function formatHoa(hoaMonthly: number | null | undefined): string {
  if (hoaMonthly == null || !Number.isFinite(hoaMonthly) || hoaMonthly <= 0) return "—";
  return `$${Math.round(hoaMonthly).toLocaleString()}/mo`;
}

function formatSubjectLine(s: CmaSnapshot): string {
  const subj = s.subject;
  const parts: string[] = [];
  if (subj.beds) parts.push(`${subj.beds} bed`);
  if (subj.baths) parts.push(`${subj.baths} bath`);
  if (subj.sqft) parts.push(`${subj.sqft.toLocaleString()} sqft`);
  if (subj.propertyType) parts.push(subj.propertyType);
  if (!isCondo(subj.propertyType)) {
    const lot = formatLot(subj.lotSizeSqft, subj.propertyType);
    if (lot !== "—") parts.push(`lot ${lot}`);
  }
  const hoa = formatHoa(subj.hoaMonthly);
  if (hoa !== "—") parts.push(`HOA ${hoa}`);
  if (subj.yearBuilt) parts.push(`built ${subj.yearBuilt}`);
  if (subj.condition) parts.push(subj.condition);
  return parts.join(" · ");
}

function compSubline(c: CmaCompRow): string {
  const parts: string[] = [];
  if (c.beds != null) parts.push(`${c.beds} bed`);
  if (c.baths != null) parts.push(`${c.baths} bath`);
  if (c.propertyType) parts.push(c.propertyType);
  if (Number.isFinite(c.distanceMiles) && c.distanceMiles > 0) {
    parts.push(`${c.distanceMiles.toFixed(1)} mi away`);
  }
  return parts.join(" · ");
}

function cellRight(doc: jsPDF, text: string, x: number, y: number): void {
  doc.text(text, x - doc.getTextWidth(text), y);
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
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
