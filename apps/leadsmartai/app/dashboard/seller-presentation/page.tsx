import { redirect } from "next/navigation";

/**
 * Seller presentations are now the consolidated generator at
 * /dashboard/presentations (sidebar: "Seller Presentation"). Kept as a
 * redirect for old links / bookmarks.
 */
export default function SellerPresentationPage() {
  redirect("/dashboard/presentations");
}
