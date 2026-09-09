import type { Metadata } from "next";
import { WorkflowEditor } from "@/components/workflow-editor";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("workflows");
  return { title: t("meta.new") };
}

export default function NewWorkflowPage() {
  return <WorkflowEditor />;
}
