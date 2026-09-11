import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { parseContactLanguage } from "@/lib/i18n/contactLocale";

type Status = "lead" | "prospect" | "active" | "inactive" | "archived";
const VALID_STATUSES: Status[] = ["lead", "prospect", "active", "inactive", "archived"];

interface ClientRow {
  first_name: string;
  last_name?: string;
  company?: string;
  email?: string;
  phone?: string;
  status?: Status;
  tags?: string;
  notes?: string;
  preferred_language?: string | null;
}

export async function POST(req: NextRequest) {
  const t = await getServerT("clients");
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  if (!orgId) return NextResponse.json({ error: t("errors.unauthorized") }, { status: 401 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: t("errors.unauthorized") }, { status: 401 });

  let rows: ClientRow[];
  try {
    const body = await req.json();
    rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("No rows");
  } catch {
    return NextResponse.json({ error: t("errors.importInvalidBody") }, { status: 400 });
  }

  const inserts = rows.map((r) => ({
    organization_id: orgId,
    first_name: (r.first_name ?? "").trim() || "Unknown",
    last_name: r.last_name?.trim() || null,
    company: r.company?.trim() || null,
    email: r.email?.trim() || null,
    phone: r.phone?.trim() || null,
    status: VALID_STATUSES.includes(r.status as Status) ? (r.status as Status) : "lead",
    tags: r.tags
      ? r.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [],
    notes: r.notes?.trim() || null,
    preferred_language: parseContactLanguage(r.preferred_language),
  }));

  // Batch insert in chunks of 100
  let inserted = 0;
  let failed = 0;

  for (let i = 0; i < inserts.length; i += 100) {
    const chunk = inserts.slice(i, i + 100);
    const { error } = await supabase.from("clients").insert(chunk);
    if (error) {
      failed += chunk.length;
    } else {
      inserted += chunk.length;
    }
  }

  return NextResponse.json({ inserted, failed, total: rows.length });
}
