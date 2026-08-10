import { requireRolePage } from "@/lib/auth/requireRolePage";
import { CRON_JOBS } from "@/lib/admin/cronJobs";
import { JobsClient } from "./JobsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cron Jobs | Admin" };

export default async function AdminJobsPage() {
  await requireRolePage(["admin"]);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <JobsClient jobs={CRON_JOBS} />
    </div>
  );
}
