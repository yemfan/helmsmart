import { getServerT } from "@/lib/i18n/server";

type Cell = {
  state: "yes" | "partial" | "no" | "text";
  text?: string;
};

type Row = {
  feature: string;
  blurb?: string;
  /** Per column: leadsmart, lofty, structurely, geek, conversionMonster */
  cells: [Cell, Cell, Cell, Cell, Cell];
};

const COLUMNS = [
  { id: "leadsmart", label: "CloseBoss", note: "(this product)" },
  { id: "lofty", label: "Lofty AI Assistant", note: "(formerly Chime)" },
  { id: "structurely", label: "Structurely Aisa Holmes", note: "" },
  { id: "geek", label: "Geek AI", note: "(Real Geeks bundle)" },
  { id: "monster", label: "Conversion Monster", note: "(human ISAs)" },
] as const;

const ROWS: Row[] = [
  {
    feature: "Native voice AI",
    blurb: "Twilio + realtime LLM, not a text bolt-on with TTS.",
    cells: [
      { state: "yes" },
      { state: "partial", text: "Add-on" },
      { state: "yes" },
      { state: "no" },
      { state: "no", text: "Humans" },
    ],
  },
  {
    feature: "Inbound voice answer",
    blurb: "Picks up an inbound call within seconds and runs a qualifying script.",
    cells: [
      { state: "yes" },
      { state: "partial" },
      { state: "yes" },
      { state: "no" },
      { state: "yes" },
    ],
  },
  {
    feature: "Outbound speed-to-lead call",
    blurb: "Calls a captured lead within seconds of the form submit.",
    cells: [
      { state: "yes" },
      { state: "no" },
      { state: "partial" },
      { state: "no" },
      { state: "yes" },
    ],
  },
  {
    feature: "Multi-language",
    blurb: "English + Spanish + Mandarin out of the box.",
    cells: [
      { state: "yes" },
      { state: "no" },
      { state: "no" },
      { state: "no" },
      { state: "partial" },
    ],
  },
  {
    feature: "Bundled with the CRM",
    blurb: "No separate vendor, no separate bill, contact records share one timeline.",
    cells: [
      { state: "yes" },
      { state: "yes" },
      { state: "no", text: "Standalone" },
      { state: "yes" },
      { state: "no", text: "Standalone" },
    ],
  },
  {
    feature: "Pricing transparency",
    blurb: "Self-serve plans you can read on the website without a sales call.",
    cells: [
      { state: "yes" },
      { state: "no" },
      { state: "partial" },
      { state: "yes" },
      { state: "no" },
    ],
  },
  {
    feature: "Hot-lead push to agent",
    blurb: "When the AI senses urgency, agents get an SMS + mobile push in seconds.",
    cells: [
      { state: "yes" },
      { state: "partial" },
      { state: "yes" },
      { state: "no" },
      { state: "yes" },
    ],
  },
];

/**
 * Comparison table built from public information about competing products.
 * The intent is honest, not point-scoring — every "yes" we claim is verifiable
 * by calling the demo phone above; partial/no claims are based on current
 * product pages + reviews and we'll update as those products ship features.
 *
 * Update cadence: review quarterly, or sooner if a competitor announces a
 * relevant feature. The data lives inline (not in a CMS) so a one-line PR
 * is the change cost.
 */
export default async function VoiceAiComparisonTable() {
  const t = await getServerT();
  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-xl font-bold text-slate-900 sm:text-2xl">{t("pages.voiceComparison.title", { ns: "dashboard" })}</h2>
        <p className="mt-1 text-sm text-slate-600">{t("pages.voiceComparison.sub", { ns: "dashboard" })}</p>
      </header>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-700"
              >{t("pages.voiceComparison.capability", { ns: "dashboard" })}</th>
              {COLUMNS.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={`px-3 py-3 text-center text-xs font-semibold tracking-wide text-slate-700 ${
                    c.id === "leadsmart" ? "bg-blue-50/50" : ""
                  }`}
                >
                  <div className={c.id === "leadsmart" ? "text-blue-900" : ""}>{c.label}</div>
                  {c.note ? (
                    <div className="mt-0.5 text-[10px] font-medium text-slate-500">{c.note}</div>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ROWS.map((r) => (
              <tr key={r.feature}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white px-4 py-3 text-left align-top"
                >
                  <div className="text-sm font-semibold text-slate-900">{r.feature}</div>
                  {r.blurb ? <div className="mt-0.5 text-xs text-slate-600">{r.blurb}</div> : null}
                </th>
                {r.cells.map((cell, i) => (
                  <td
                    key={i}
                    className={`px-3 py-3 text-center align-middle ${
                      i === 0 ? "bg-blue-50/40" : ""
                    }`}
                  >
                    <CellMark cell={cell} t={t} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CellMark({ cell, t }: { cell: Cell; t: (k: string, o?: Record<string, unknown>) => string }) {
  if (cell.state === "yes") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <span aria-hidden>✓</span> {cell.text ?? "Yes"}
      </span>
    );
  }
  if (cell.state === "partial") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
        <span aria-hidden>~</span> {cell.text ?? t("pages.voiceAiComparisonTable.partial", { ns: "dashboard" })}
      </span>
    );
  }
  if (cell.state === "no") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
        <span aria-hidden>—</span> {cell.text ?? "No"}
      </span>
    );
  }
  return <span className="text-xs text-slate-700">{cell.text}</span>;
}
