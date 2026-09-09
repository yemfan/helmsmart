import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { listProjectsPnL } from "@/lib/actions/projects";
import { ProjectsClient } from "./projects-client";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("projects");
  return { title: t("meta.projects") };
}

export default async function ProjectsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const [projects, clientsRes] = await Promise.all([
    listProjectsPnL(),
    supabase
      .from("clients")
      .select("id, first_name, last_name, company")
      .eq("organization_id", orgId)
      .order("first_name"),
  ]);

  const clients = (clientsRes.data ?? []) as {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  }[];

  return <ProjectsClient initialProjects={projects} clients={clients} />;
}
