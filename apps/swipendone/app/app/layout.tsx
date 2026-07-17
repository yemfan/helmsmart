import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/lib/actions/auth";
import { Logo } from "@/components/logo";
import styles from "./dashboard.module.css";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // Middleware already guards /app, but double-check for defense in depth.
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  if (supabase && !user) redirect("/login");

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/app" className={styles.logo} style={{ display: "inline-flex" }}>
          <Logo height={26} />
        </Link>
        <div className={styles.topActions}>
          {user?.email && <span className={styles.email}>{user.email}</span>}
          <form action={signOut}>
            <button type="submit" className={styles.btn}>
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
