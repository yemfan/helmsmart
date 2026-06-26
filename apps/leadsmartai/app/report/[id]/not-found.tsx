import Link from "next/link";

export default function ReportNotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Report not found</h1>
      <p className="mt-3 text-slate-600">
        This link may be invalid or the report may have been removed. Ask your agent for an updated link.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
      >
        RealtyBoss home
      </Link>
    </div>
  );
}
