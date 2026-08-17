import { requireRole } from "@/lib/auth/requireRole";
import { CRON_JOBS } from "@/app/api/admin/cron-jobs/route";
import { JobsClient } from "./JobsClient";
import { getServerT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cron Jobs | Admin" };

export default async function AdminJobsPage() {
  const t = await getServerT();
  await requireRole(["admin", "support"], { strictUnauthorized: true });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <JobsClient jobs={CRON_JOBS} />
    </div>
  );
}
