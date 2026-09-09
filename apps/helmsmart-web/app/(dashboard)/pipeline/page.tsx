import type { Metadata } from "next";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { PipelineBoard } from "./pipeline-board";
import { term } from "@/lib/packs";
import { getServerT } from "@/lib/i18n/server";
import { ResponsibleEmployee } from "@/components/responsible-employee";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getServerT("pipeline");
  return { title: t("meta.title") };
}

export type PipelineStage = "lead" | "qualified" | "proposal" | "negotiation" | "won" | "lost";

export type PipelineClient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  pipeline_stage: PipelineStage;
  expected_value: number | null;
  pipeline_note: string | null;
  stage_changed_at: string;
  lifetime_value: number | null;
  created_at: string;
};

export default async function PipelinePage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("helmsmart-org-id")?.value ?? "";
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select(
      "id, first_name, last_name, company, email, phone, status, pipeline_stage, expected_value, pipeline_note, stage_changed_at, lifetime_value, created_at"
    )
    .eq("organization_id", orgId)
    .order("stage_changed_at", { ascending: false });

  // A vertical pack may rename the board ("Deals", "Matters"); when it doesn't,
  // `term` echoes the English label back and the translated title wins.
  const [packTerm, t] = await Promise.all([term("Pipeline"), getServerT("pipeline")]);
  const title = packTerm === "Pipeline" ? t("board.title") : packTerm;

  return (
    <PipelineBoard
      initialClients={(clients ?? []) as PipelineClient[]}
      title={title}
      owner={<ResponsibleEmployee slug="sarah" />}
    />
  );
}
