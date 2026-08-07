import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Connections moved into the consolidated Settings page. */
export default function ConnectionsPage() {
  redirect("/settings?tab=connections");
}
