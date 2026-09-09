import type { Metadata } from "next";
import { FormBuilderEditor } from "@/components/form-builder-editor";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.newForm") };
}

export default function NewFormPage() {
  return <FormBuilderEditor />;
}
