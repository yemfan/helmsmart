import Link from "next/link";
import { SOCIAL_CHANNELS, isChannelConnected } from "@/lib/social-channels";

/**
 * Read-only channel status for /social. Connected channels show nothing extra
 * (just a green dot + name); only not-connected ones say "not connected".
 * Connect/disconnect lives in Settings → Marketing.
 */
export function ChannelStatusList({ connected }: { connected: string[] }) {
  const set = new Set(connected);
  return (
    <div className="mx-4 mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-900">Channels</p>
        <Link
          href="/settings?tab=marketing"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          Manage in Settings →
        </Link>
      </div>
      <ul className="flex flex-wrap gap-2">
        {SOCIAL_CHANNELS.map((ch) => {
          const on = isChannelConnected(ch, set);
          const manual = ch.provider === null;
          return (
            <li
              key={ch.key}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                on
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${on ? "bg-emerald-500" : "bg-slate-300"}`}
              />
              {ch.label}
              {/* Say nothing when connected; only flag what still needs attention. */}
              {!on && (
                <span className="text-[11px] font-normal text-slate-400">
                  {manual ? "manual" : "not connected"}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
