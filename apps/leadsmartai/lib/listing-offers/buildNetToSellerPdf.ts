import "server-only";

import { jsPDF } from "jspdf";
import {
  DEFAULT_NET_TO_SELLER_ASSUMPTIONS,
  computeNetToSeller,
  type NetToSellerInputs,
} from "./netToSeller";
import type { ListingOfferRow } from "./types";
import type { SubjectPhoto } from "@/lib/cma/streetViewPhoto";

/**
 * Renders a one-page "Net-to-Seller Summary" PDF for a single
 * accepted/active listing offer. Intended as a signable leave-behind
 * the listing agent gives the seller to confirm terms before formally
 * accepting.
 *
 * Uses jspdf (already a monorepo dep). Returns a Uint8Array the route
 * can stream back as application/pdf. No external services.
 */

export type NetToSellerPdfInput = {
  offer: Pick<
    ListingOfferRow,
    | "buyer_name"
    | "buyer_agent_name"
    | "buyer_brokerage"
    | "offer_price"
    | "current_price"
    | "earnest_money"
    | "down_payment"
    | "financing_type"
    | "closing_date_proposed"
    | "seller_concessions"
    | "inspection_contingency"
    | "appraisal_contingency"
    | "loan_contingency"
    | "sale_of_home_contingency"
    | "offer_expires_at"
  >;
  /** Property address lives on the parent transaction, not listing_offers. */
  propertyAddress: string;
  assumptions?: Partial<Omit<NetToSellerInputs, "price" | "sellerConcessions">>;
  agent: {
    name: string | null;
    brokerage: string | null;
    phone: string | null;
    email: string | null;
    licenseNumber: string | null;
  };
  /** Brokerage logo (letterhead, top-right); null hides it. */
  agentLogo?: SubjectPhoto | null;
  listingCity: string | null;
  listingState: string | null;
  listingZip: string | null;
};

export function buildNetToSellerPdf(input: NetToSellerPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();

  const leftMargin = 48;
  const rightMargin = pageWidth - 48;
  let y = 56;

  // Header — title + agent identity, with brokerage logo as letterhead.
  if (input.agentLogo) {
    try {
      const lw = 96;
      const lh = 30;
      doc.addImage(input.agentLogo.dataUrl, input.agentLogo.format, rightMargin - lw, y - 12, lw, lh, undefined, "FAST");
    } catch {
      /* skip logo on decode failure */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Net-to-Seller Summary", leftMargin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  const headerMeta: string[] = [];
  if (input.agent.name) headerMeta.push(input.agent.name);
  if (input.agent.brokerage) headerMeta.push(input.agent.brokerage);
  if (input.agent.licenseNumber) headerMeta.push(`BRE #${input.agent.licenseNumber}`);
  if (headerMeta.length) {
    doc.text(headerMeta.join(" · "), leftMargin, y);
    y += 14;
  }
  const contactLine = [input.agent.phone, input.agent.email].filter(Boolean).join(" · ");
  if (contactLine) {
    doc.text(contactLine, leftMargin, y);
    y += 14;
  }
  doc.setTextColor(0);
  y += 8;

  // Property block
  drawSectionHeader(doc, "Property", leftMargin, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(input.propertyAddress, leftMargin, y);
  y += 14;
  const cityLine = [input.listingCity, input.listingState, input.listingZip]
    .filter(Boolean)
    .join(", ");
  if (cityLine) {
    doc.setTextColor(100);
    doc.text(cityLine, leftMargin, y);
    doc.setTextColor(0);
    y += 14;
  }
  y += 6;

  // Offer terms block
  drawSectionHeader(doc, "Offer terms", leftMargin, y);
  y += 18;
  const price = input.offer.current_price ?? input.offer.offer_price;
  const sellerConcessions = input.offer.seller_concessions ?? 0;
  const termsRows: Array<[string, string]> = [
    ["Offer price", formatMoney(price)],
    ["Original offer", input.offer.current_price != null && input.offer.current_price !== input.offer.offer_price ? formatMoney(input.offer.offer_price) : "—"],
    ["Earnest money", formatMoney(input.offer.earnest_money ?? null)],
    ["Down payment", formatMoney(input.offer.down_payment ?? null)],
    ["Financing", input.offer.financing_type ? capitalize(input.offer.financing_type) : "—"],
    ["Closing date", input.offer.closing_date_proposed ?? "—"],
    ["Offer expires", input.offer.offer_expires_at ? formatDateTime(input.offer.offer_expires_at) : "—"],
    ["Seller concessions requested", formatMoney(sellerConcessions || null)],
  ];
  const buyerIdentity = [input.offer.buyer_name, input.offer.buyer_agent_name, input.offer.buyer_brokerage]
    .filter(Boolean)
    .join(" · ");
  if (buyerIdentity) {
    termsRows.unshift(["Buyer", buyerIdentity]);
  }
  y = drawTable(doc, termsRows, leftMargin, rightMargin, y);

  // Contingencies
  const contingencies = [
    input.offer.inspection_contingency && "Inspection",
    input.offer.appraisal_contingency && "Appraisal",
    input.offer.loan_contingency && "Loan",
    input.offer.sale_of_home_contingency && "Sale of home",
  ].filter(Boolean) as string[];
  y = drawTable(
    doc,
    [["Contingencies", contingencies.length ? contingencies.join(", ") : "None (all waived)"]],
    leftMargin,
    rightMargin,
    y,
  );

  y += 8;

  // Net-to-seller breakdown
  drawSectionHeader(doc, "Net to seller — estimated", leftMargin, y);
  y += 18;

  const assumptions = {
    commissionPct:
      input.assumptions?.commissionPct ?? DEFAULT_NET_TO_SELLER_ASSUMPTIONS.commissionPct,
    titleEscrowPct:
      input.assumptions?.titleEscrowPct ?? DEFAULT_NET_TO_SELLER_ASSUMPTIONS.titleEscrowPct,
    transferTaxPct:
      input.assumptions?.transferTaxPct ?? DEFAULT_NET_TO_SELLER_ASSUMPTIONS.transferTaxPct,
    otherCostsFlat:
      input.assumptions?.otherCostsFlat ?? DEFAULT_NET_TO_SELLER_ASSUMPTIONS.otherCostsFlat,
  };

  const breakdown = computeNetToSeller({
    price,
    commissionPct: assumptions.commissionPct,
    titleEscrowPct: assumptions.titleEscrowPct,
    transferTaxPct: assumptions.transferTaxPct,
    sellerConcessions,
    otherCostsFlat: assumptions.otherCostsFlat,
  });

  const breakdownRows: Array<[string, string]> = [
    ["Gross offer price", formatMoney(breakdown.price)],
    [`Commission (${assumptions.commissionPct}%)`, `− ${formatMoney(breakdown.commission)}`],
    [`Title & escrow (${assumptions.titleEscrowPct}%)`, `− ${formatMoney(breakdown.titleEscrow)}`],
    [`Transfer tax (${assumptions.transferTaxPct}%)`, `− ${formatMoney(breakdown.transferTax)}`],
    ["Seller concessions", `− ${formatMoney(breakdown.sellerConcessions)}`],
    ["Other flat costs", `− ${formatMoney(breakdown.otherCostsFlat)}`],
  ];
  y = drawTable(doc, breakdownRows, leftMargin, rightMargin, y);

  // Net line — emphasized
  y += 4;
  doc.setDrawColor(15);
  doc.line(leftMargin, y, rightMargin, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Estimated net to seller", leftMargin, y);
  const netLabel = formatMoney(breakdown.net);
  doc.text(netLabel, rightMargin - doc.getTextWidth(netLabel), y);
  y += 22;

  // Disclosure
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  const disclosure = [
    "Estimate only. Actual net depends on final title/escrow fees, county recording charges,",
    "prorations for property tax and HOA, outstanding mortgage payoff, lender credits, and",
    "other closing-day adjustments. Consult your escrow officer for the final settlement statement.",
    "Generated by LeadSmart AI.",
  ];
  for (const line of disclosure) {
    doc.text(line, leftMargin, y);
    y += 10;
  }
  doc.setTextColor(0);

  return new Uint8Array(doc.output("arraybuffer"));
}

function drawSectionHeader(
  doc: jsPDF,
  title: string,
  x: number,
  y: number,
): void {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(50);
  doc.text(title.toUpperCase(), x, y);
  doc.setTextColor(0);
  doc.setDrawColor(200);
  doc.line(x, y + 4, x + 480, y + 4);
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

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
