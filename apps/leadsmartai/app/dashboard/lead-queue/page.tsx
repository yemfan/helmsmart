import { LeadQueueClient } from "./LeadQueueClient";

export const metadata = {
  title: "Lead Queue | RealtyBoss",
  description: "Claim available leads from the shared queue.",
};

export default function LeadQueuePage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <LeadQueueClient />
    </div>
  );
}
