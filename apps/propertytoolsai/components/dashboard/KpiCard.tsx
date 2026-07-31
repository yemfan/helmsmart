type Props = {
  label: string;
  value: string;
  /** % change vs the previous period. null = no comparable baseline (hide the badge). */
  deltaPct?: number | null;
  /** Daily series for a mini sparkline. Needs at least 2 points to render. */
  spark?: number[];
};

function Sparkline({ points }: { points: number[] }) {
  const w = 72;
  const h = 22;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const d = points
    .map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 text-gray-300"
      fill="none"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={d}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function KpiCard({ label, value, deltaPct, spark }: Props) {
  const hasDelta = deltaPct != null && Number.isFinite(deltaPct);
  const up = (deltaPct ?? 0) >= 0;
  const hasSpark = Array.isArray(spark) && spark.length > 1;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="text-2xl font-semibold tabular-nums text-gray-900">{value}</div>
        {hasSpark ? <Sparkline points={spark as number[]} /> : null}
      </div>
      {hasDelta ? (
        <div
          className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
            up ? "text-emerald-600" : "text-red-600"
          }`}
        >
          <span aria-hidden>{up ? "▲" : "▼"}</span>
          <span>{Math.abs(deltaPct as number).toFixed(0)}%</span>
          <span className="font-normal text-gray-400">vs prev period</span>
        </div>
      ) : null}
    </div>
  );
}
