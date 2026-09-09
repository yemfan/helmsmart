import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getForm } from "@/lib/actions/forms";
import { FormBuilderEditor } from "@/components/form-builder-editor";
import { getServerT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("marketing");
  return { title: t("meta.editForm") };
}

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const form = await getForm(id);
  if (!form) notFound();

  return (
    <FormBuilderEditor
      formId={id}
      initialValues={{
        title: form.title,
        description: form.description ?? "",
        slug: form.slug,
        fields: form.fields,
        successMessage: form.success_message,
        autoCreateClient: form.auto_create_client,
        notifyEmail: form.notify_email ?? "",
        notifySms: form.notify_sms,
        redirectUrl: form.redirect_url ?? "",
        isActive: form.is_active,
      }}
    />
  );
}
