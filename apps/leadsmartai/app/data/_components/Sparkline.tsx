import type { SeriesPoint } from "@/lib/research/warehouse/read";
import { formatValue, formatPeriod, isNum } from "@/lib/research/warehouse/format";
import { getServerT } from "@/lib/i18n/server";

/**
 * Dependency-free inline SVG line chart for a warehouse metric series.
 *
 * Server component — renders a single <svg> with a smooth line path, a subtle
 * area fill, and a labeled end-point. No client JS, no external chart lib, CSP-safe.
 * Responsive via viewBox + width:100%. Null points are skipped in the path so
 * gaps don't collapse to zero.
 */

type Props = {
  series: SeriesPoint[];
  unit: string | null;
  label: string;
  /** accessible caption / title */
  title: string;
};

const W = 640;
const H = 180;
const PAD_X = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

export default async function Sparkline({ series, unit, label, title }: Props) {
  const t = await getServerT();
  const points = series
    .map((p, i) => ({ i, period: p.period, value: p.value }))
    .filter((p): p is { i: number; period: string; value: number } =>
      isNum(p.value),
    );

  if (points.length < 2) {
    return (
      <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-sm text-slate-400">
        Not enough data to chart {label.toLowerCase()} yet.
      </div>
    );
  }

  const values = points.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    // flat line — pad so it renders mid-height
    min -= 1;
    max += 1;
  }

  const n = series.length;
  const xFor = (idx: number) =>
    PAD_X + (idx / Math.max(1, n - 1)) * (W - PAD_X * 2);
  const yFor = (v: number) =>
    PAD_TOP + (1 - (v - min) / (max - min)) * (H - PAD_TOP - PAD_BOTTOM);

  const linePath = points
    .map((p, k) => `${k === 0 ? "M" : "L"} ${xFor(p.i).toFixed(1)} ${yFor(p.value).toFixed(1)}`)
    .join(" ");

  const first = points[0];
  const last = points[points.length - 1];
  const areaPath =
    `${linePath} L ${xFor(last.i).toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)}` +
    ` L ${xFor(first.i).toFixed(1)} ${(H - PAD_BOTTOM).toFixed(1)} Z`;

  const rising = last.value >= first.value;
  const stroke = rising ? "#0072ce" : "#dc2626"; // CloseBoss brand blue / red-600
  const fill = rising ? "rgba(0,114,206,0.08)" : "rgba(220,38,38,0.08)";

  const endX = xFor(last.i);
  const endY = yFor(last.value);
  const labelText = formatValue(last.value, unit, { compact: true });
  const anchorRight = endX > W - 90;

  return (
    <figure className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <span className="text-xs text-slate-500">
          {formatPeriod(first.period)} – {formatPeriod(last.period)}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={title}
        preserveAspectRatio="none"
        className="h-auto w-full"
        style={{ maxWidth: "100%" }}
      >
        <title>{title}</title>
        <path d={areaPath} fill={fill} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={endX} cy={endY} r={3.5} fill={stroke} />
        <text
          x={anchorRight ? endX - 8 : endX + 8}
          y={Math.max(PAD_TOP + 4, endY - 8)}
          fontSize={13}
          fontWeight={700}
          fill={stroke}
          textAnchor={anchorRight ? "end" : "start"}
        >
          {labelText}
        </text>
      </svg>
    </figure>
  );
}
