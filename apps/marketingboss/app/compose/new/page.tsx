import { redirect } from "next/navigation";

/** Moved in the 2.0 IA — creating a post is a new Action. */
export default function LegacyComposeNewPage() {
  redirect("/actions/new");
}
