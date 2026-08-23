import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { getPropertyToolsConsumerPostLoginUrl } from "@/lib/propertyToolsConsumerUrl";
import { resolveRoleHomePath } from "@/lib/rolePortalPaths";
import { fetchUserPortalContext } from "@/lib/rolePortalServer";
import { consumerShouldUsePropertyToolsApp } from "@/lib/signupOriginApp";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { getServerT } from "@/lib/i18n/server";

export const metadata = {
  title: "Access denied | CloseBoss",
  robots: { index: false, follow: false },
};

function homeHref(ctx: Awaited<ReturnType<typeof fetchUserPortalContext>>): string {
  if (!ctx) return "/login";
  const r = String(ctx.role ?? "").toLowerCase().trim();
  if (r === "consumer" || r === "user" || r === "") {
    return consumerShouldUsePropertyToolsApp(ctx.signupOriginApp)
      ? getPropertyToolsConsumerPostLoginUrl()
      : "/";
  }
  return resolveRoleHomePath(ctx.role, ctx.hasAgentRow);
}

export default async function UnauthorizedPage() {
  const t = await getServerT();
  const supabase = supabaseServerClient();
  const ctx = await fetchUserPortalContext(supabase);
  const href = homeHref(ctx);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800">
          <ShieldAlert className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-5 text-xl font-bold text-slate-900">{t("pages.dashFragments.noAccess", { ns: "dashboard" })}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{t("pages.dashFragments.noAccessBody", { ns: "dashboard" })}</p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href={href}
            className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {ctx
              ? t("pages.dashFragments.goToMyDashboard", { ns: "dashboard" })
              : t("pages.dashFragments.logIn", { ns: "dashboard" })}
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >{t("pages.articleChrome.home", { ns: "dashboard" })}</Link>
        </div>
      </div>
    </div>
  );
}
