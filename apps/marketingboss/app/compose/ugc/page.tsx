import { redirect } from "next/navigation";

/** Moved in the 2.0 IA — the UGC wizard lives under Actions. */
export default function LegacyUgcPage() {
  redirect("/actions/ugc");
}
