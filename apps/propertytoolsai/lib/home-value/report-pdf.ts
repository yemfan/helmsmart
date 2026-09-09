/**
 * Home-value report PDF generation.
 *
 * Playwright/Chromium is NOT available in Vercel serverless functions,
 * so we skip server-side PDF generation and return a placeholder.
 * The full report is rendered in the browser; a client-side "Download PDF"
 * button can be added later using jsPDF or html2canvas.
 */

type GeneratePdfInput = {
  address: string;
  estimateValue: number;
  rangeLow: number;
  rangeHigh: number;
  confidence: string;
  medianPpsf?: number;
  localTrendPct?: number;
  compCount?: number;
  sessionId: string;
};

export async function generateHomeValueReportPdf(input: GeneratePdfInput) {
  // PDF generation is deferred to the client side.
  // Return a stub so callers don't break.
  return {
    outputPath: null as string | null,
    filename: `${input.sessionId}.pdf`,
  };
}
