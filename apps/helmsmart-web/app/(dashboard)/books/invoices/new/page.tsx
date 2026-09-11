import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { InvoiceBuilder } from "@/components/invoice-builder";
import { RoleGuard } from "@/components/role-guard";
import { ArrowLeft } from "lucide-react";
import { getServerT } from "@/lib/i18n/server";
import { orgCurrency } from "@/lib/books-currency";
import { orgTimezone } from "@/lib/org-timezone";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("books");
  return { title: t("invoices.new.metaTitle") };
}

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client: preselectedClientId } = await searchParams;
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const t = await getServerT("books");
  const [currency, timeZone] = await Promise.all([orgCurrency(orgId), orgTimezone(orgId)]);

  const [{ data: clients }, { data: revenueAccounts }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, first_name, last_name, company, email")
      .eq("organization_id", orgId)
      .order("last_name"),
    supabase
      .from("chart_of_accounts")
      .select("id, code, name")
      .eq("organization_id", orgId)
      .eq("type", "revenue")
      .order("code"),
  ]);

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Link
          href="/books/invoices"
          className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-500"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t("invoices.new.title")}</h1>
          <p className="text-sm text-slate-500">{t("invoices.new.subtitle")}</p>
        </div>
      </div>

      <RoleGuard permission="invoices.write" />
      <InvoiceBuilder
        clients={(clients ?? []) as { id: string; first_name: string | null; last_name: string | null; company: string | null; email: string | null }[]}
        revenueAccounts={(revenueAccounts ?? []) as { id: string; code: string; name: string }[]}
        preselectedClientId={preselectedClientId}
        currency={currency}
        timeZone={timeZone}
      />
    </div>
  );
}
