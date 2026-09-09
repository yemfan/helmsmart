import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { ProjectTemplateEditor } from "@/components/project-template-editor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("projects");
  return { title: t("meta.editTemplate") };
}

export default async function EditProjectTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const { data: tpl } = await supabase
    .from("project_templates")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (!tpl) notFound();

  return (
    <ProjectTemplateEditor
      templateId={id}
      initialValues={{
        name: tpl.name,
        description: tpl.description ?? "",
        color: tpl.color,
        budgetHours: tpl.budget_hours ? String(tpl.budget_hours) : "",
        hourlyRate: tpl.hourly_rate ? String(tpl.hourly_rate) : "",
        defaultDurationDays: tpl.default_duration_days ? String(tpl.default_duration_days) : "",
        defaultTasks: (tpl.default_tasks ?? []) as Array<{ title: string; priority: string; offset_days?: number }>,
      }}
    />
  );
}
