import Link from "next/link";
import { listGuides } from "@/lib/dashboard-data";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

function badgeClass(status: string) {
  if (status === "published") return `${styles.badge} ${styles.badgePublished}`;
  if (status === "archived") return `${styles.badge} ${styles.badgeArchived}`;
  return `${styles.badge} ${styles.badgeDraft}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function GuideListPage() {
  const guides = await listGuides();

  return (
    <main className={styles.container}>
      <div className={styles.pageHead}>
        <div>
          <h1 className={styles.h1}>Your guides</h1>
          <p className={styles.sub}>Create, edit, and publish bilingual instruction guides.</p>
        </div>
        <Link href="/app/new" className={`${styles.btn} ${styles.btnAccent}`}>
          + New guide
        </Link>
      </div>

      {guides.length === 0 ? (
        <div className={styles.empty}>
          <h2>Create your first guide.</h2>
          <p>Upload photos and rough notes — AI turns them into a swipeable, bilingual guide.</p>
          <Link href="/app/new" className={`${styles.btn} ${styles.btnAccent}`}>
            + New guide
          </Link>
        </div>
      ) : (
        <div className={styles.grid}>
          {guides.map((g) => (
            <Link key={g.id} href={`/app/guide/${g.id}`} className={styles.card}>
              <div>
                <div className={styles.cardName}>{g.name}</div>
                <div className={styles.cardMeta}>
                  <span>{fmtDate(g.created_at)}</span>
                  <span>{g.scans7d} scans (7d)</span>
                  {g.slug && <span>/g/{g.slug}</span>}
                </div>
              </div>
              <span className={badgeClass(g.status)}>{g.status}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
