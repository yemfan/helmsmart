import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { WorkflowEditor } from "@/components/workflow-editor";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("workflows");
  return { title: t("meta.edit") };
}

export default async function EditWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const { data: wf } = await supabase
    .from("approval_workflows")
    .select("*, steps:approval_workflow_steps(*)")
    .eq("id", id)
    .eq("organization_id", orgId)
    .single();

  if (!wf) notFound();

  const steps = ((wf.steps ?? []) as Array<{
    step_order: number;
    step_name: string;
    approver_role?: string;
    timeout_hours?: number;
  }>)
    .sort((a, b) => a.step_order - b.step_order)
    .map((s) => ({
      step_name: s.step_name,
      approver_role: s.approver_role ?? "",
      timeout_hours: s.timeout_hours ? String(s.timeout_hours) : "",
    }));

  const cfg = (wf.trigger_config ?? {}) as { amount_threshold?: number };

  return (
    <WorkflowEditor
      workflowId={id}
      initialValues={{
        name: wf.name,
        description: wf.description ?? "",
        triggerType: wf.trigger_type,
        amountThreshold: cfg.amount_threshold != null ? String(cfg.amount_threshold) : "",
        isActive: wf.is_active,
        steps,
      }}
    />
  );
}
