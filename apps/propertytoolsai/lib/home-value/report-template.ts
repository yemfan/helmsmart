export type ReportTemplateInput = {
  address: string;
  estimateValue: number;
  rangeLow: number;
  rangeHigh: number;
  confidence: string;
  medianPpsf?: number;
  localTrendPct?: number;
  compCount?: number;
};

function money(value?: number) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildHomeValueReportHtml(input: ReportTemplateInput) {
  return `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Home Value Report</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          color: #111827;
          padding: 40px;
          line-height: 1.5;
        }
        .container {
          max-width: 820px;
          margin: 0 auto;
        }
        .pill {
          display: inline-block;
          border: 1px solid #e5e7eb;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 12px;
          color: #4b5563;
          margin-bottom: 16px;
        }
        h1, h2 {
          margin: 0 0 12px 0;
        }
        .hero {
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          padding: 24px;
          margin-bottom: 24px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        .card {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 18px;
        }
        .label {
          font-size: 12px;
          color: #6b7280;
        }
        .value {
          font-size: 24px;
          font-weight: 700;
          margin-top: 8px;
        }
        ul {
          padding-left: 18px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="pill">PropertyToolsAI</div>
        <div class="hero">
          <h1>Home Value Report</h1>
          <p>${input.address}</p>
        </div>

        <div class="grid">
          <div class="card">
            <div class="label">Estimated Value</div>
            <div class="value">${money(input.estimateValue)}</div>
          </div>
          <div class="card">
            <div class="label">Value Range</div>
            <div class="value">${money(input.rangeLow)} - ${money(input.rangeHigh)}</div>
          </div>
          <div class="card">
            <div class="label">Confidence</div>
            <div class="value" style="text-transform: capitalize;">${input.confidence}</div>
          </div>
        </div>

        <div class="card" style="margin-bottom: 24px;">
          <h2>Market Snapshot</h2>
          <p>Median Price / Sqft: ${money(input.medianPpsf)}</p>
          <p>Local Trend: ${
            typeof input.localTrendPct === "number"
              ? `${(input.localTrendPct * 100).toFixed(1)}%`
              : "—"
          }</p>
          <p>Comparable Data Points: ${input.compCount ?? "—"}</p>
        </div>

      </div>
    </body>
  </html>
  `;
}
