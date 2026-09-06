import { DashboardPageSkeleton } from "@/components/ui/RouteSkeleton";

/** Segment-level loading state — every dashboard route shows an outline
 *  while its server component renders, instead of a blank pane. Routes with
 *  a distinctive shape override it with their own loading.tsx. */
export default function DashboardLoading() {
  return <DashboardPageSkeleton />;
}
