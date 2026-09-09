/**
 * Public form page — /f/[slug]
 * No authentication required. Renders the form and submits to /api/forms/[slug]
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/server";
import { PublicFormRenderer } from "@/components/public-form-renderer";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const db = await createServiceClient();
  const { data: form } = await db
    .from("form_definitions")
    .select("title, description")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!form) {
    const t = await getServerT("marketing");
    return { title: t("publicForm.metaFallback") };
  }
  return {
    title: form.title,
    description: form.description ?? undefined,
  };
}

export default async function PublicFormPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const db = await createServiceClient();

  const { data: form } = await db
    .from("form_definitions")
    .select("id, title, description, fields, success_message, redirect_url")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!form) notFound();

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <PublicFormRenderer
          slug={slug}
          title={form.title}
          description={form.description}
          fields={form.fields as Parameters<typeof PublicFormRenderer>[0]["fields"]}
          successMessage={form.success_message}
          redirectUrl={form.redirect_url}
        />
      </div>
    </div>
  );
}
