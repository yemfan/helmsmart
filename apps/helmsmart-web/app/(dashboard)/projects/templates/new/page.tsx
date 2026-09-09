import type { Metadata } from "next";
import { ProjectTemplateEditor } from "@/components/project-template-editor";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("projects");
  return { title: t("meta.newTemplate") };
}

export default function NewProjectTemplatePage() {
  return <ProjectTemplateEditor />;
}
