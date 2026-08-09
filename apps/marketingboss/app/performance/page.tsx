import { redirect } from "next/navigation";

/** Moved in the 2.0 IA — performance is Learning (the "why it works" view). */
export default function LegacyPerformancePage() {
  redirect("/learning");
}
