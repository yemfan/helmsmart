import { redirect } from "next/navigation";

/** Moved in the 2.0 IA — the posting hub became Actions. */
export default function LegacyComposePage() {
  redirect("/actions");
}
