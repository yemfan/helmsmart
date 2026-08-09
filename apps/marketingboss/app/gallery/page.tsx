import { redirect } from "next/navigation";

/** Moved in the 2.0 IA — the gallery is the Studio's asset library. */
export default function LegacyGalleryPage() {
  redirect("/studio/gallery");
}
