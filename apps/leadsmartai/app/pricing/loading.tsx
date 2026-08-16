import { getServerT } from "@/lib/i18n/server";

export default async function PricingLoading() {
  const t = await getServerT();
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header skeleton */}
      <div className="border-b border-slate-200/80 bg-gradient-to-b from-slate-50 to-white px-4 py-14 text-center md:px-6 md:py-16 animate-pulse">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex justify-center">
            <div className="h-6 w-48 rounded-full bg-slate-200" />
          </div>
          <div className="h-10 bg-slate-200 rounded w-2/3 mx-auto mb-4" />
          <div className="space-y-2">
            <div className="h-4 bg-slate-200 rounded w-full" />
            <div className="h-4 bg-slate-200 rounded w-3/4 mx-auto" />
          </div>
        </div>
      </div>

      {/* Plan cards skeleton */}
      <div className="px-4 py-12 md:px-6 animate-pulse">
        <div className="mx-auto grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="relative flex flex-col rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="h-5 bg-slate-200 rounded w-20 mb-4" />
              <div className="flex items-baseline gap-2 mb-4">
                <div className="h-8 bg-slate-200 rounded w-24" />
                <div className="h-4 bg-slate-200 rounded w-16" />
              </div>
              <div className="h-4 bg-slate-200 rounded w-32 mb-6" />
              <div className="space-y-2">
                <div className="h-10 bg-slate-200 rounded" />
                <div className="h-3 bg-slate-200 rounded w-2/3 mx-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature comparison table skeleton */}
      <div className="px-4 pb-20 md:px-6 animate-pulse">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 h-6 bg-slate-200 rounded w-1/3 mx-auto" />

          <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              {/* Table header skeleton */}
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-4 text-left w-1/3">
                    <div className="h-4 bg-slate-300 rounded w-20" />
                  </th>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <th key={i} className="px-5 py-4 text-center">
                      <div className="h-4 bg-slate-300 rounded w-16 mx-auto" />
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Table body skeleton */}
              <tbody>
                {Array.from({ length: 8 }).map((_, rowIdx) => (
                  <tr
                    key={rowIdx}
                    className={`border-t border-slate-100 ${
                      rowIdx % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    }`}
                  >
                    <td className="px-5 py-3">
                      <div className="h-4 bg-slate-200 rounded w-40" />
                    </td>
                    {Array.from({ length: 4 }).map((_, colIdx) => (
                      <td key={colIdx} className="px-4 py-3 text-center">
                        <div className="h-4 bg-slate-200 rounded w-12 mx-auto" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
