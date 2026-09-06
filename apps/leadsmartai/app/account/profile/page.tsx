import { redirect } from "next/navigation";

/**
 * Profile moved into Settings › Account (2026-09 UX audit: settings were
 * split across three places). Old links, the account menu and bookmarks
 * land here and are forwarded.
 */
export default function AccountProfilePage() {
  redirect("/dashboard/settings/account");
}
