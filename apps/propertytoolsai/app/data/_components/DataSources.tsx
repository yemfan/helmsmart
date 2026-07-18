/**
 * Sources / E-E-A-T link-out block shared by every Data Center market page.
 * Links to the primary public providers our warehouse is built from.
 */

const SOURCES = [
  {
    title: "Zillow Research Data",
    publisher: "Zillow",
    url: "https://www.zillow.com/research/data/",
  },
  {
    title: "Redfin Data Center",
    publisher: "Redfin",
    url: "https://www.redfin.com/news/data-center/",
  },
  {
    title: "Mortgage rates & 10-year Treasury (FRED)",
    publisher: "Federal Reserve Bank of St. Louis",
    url: "https://fred.stlouisfed.org/",
  },
];

export default function DataSources() {
  return (
    <section aria-label="Sources" className="space-y-3 border-t border-slate-200 pt-8">
      <h2 className="text-lg font-bold text-slate-900">Sources &amp; methodology</h2>
      <p className="text-sm text-slate-500">
        Every figure on this page is drawn from authoritative public housing and
        mortgage data, refreshed monthly. Home values shown as ZHVI are a smoothed
        typical-value index, not raw sale prices. We cite openly so you can verify.
      </p>
      <ul className="space-y-2 text-sm">
        {SOURCES.map((s) => (
          <li key={s.url} className="flex gap-2">
            <span className="shrink-0 text-slate-400">·</span>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-700 hover:underline"
            >
              {s.title}
              <span className="text-slate-500"> — {s.publisher}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
