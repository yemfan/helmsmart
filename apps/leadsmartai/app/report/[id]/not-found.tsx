import Link from "next/link";
import { getServerT } from "@/lib/i18n/server";

export default async function ReportNotFound() {
  const t = await getServerT();
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-4 py-20 text-center">
      <h1 className="text-2xl font-bold text-slate-900">{t("pages.dashFragments.reportNotFound", { ns: "dashboard" })}</h1>
      <p className="mt-3 text-slate-600">{t("pages.dashFragments.reportNotFoundBody", { ns: "dashboard" })}</p>
      <Link
        href="/"
        className="mt-8 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
      >{t("pages.dashFragments.closeBossHome", { ns: "dashboard" })}</Link>
    </div>
  );
}
