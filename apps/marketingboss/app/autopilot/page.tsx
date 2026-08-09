import { redirect } from "next/navigation";

/** Moved in the 2.0 IA — Autopilot campaigns are Playbooks. */
export default function LegacyAutopilotPage() {
  redirect("/playbooks");
}
