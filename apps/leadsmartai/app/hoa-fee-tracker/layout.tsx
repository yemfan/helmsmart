import { Metadata } from "next";

export const metadata: Metadata = {
  title: "HOA Fee Tracker | CloseBoss",
  description: "Project total HOA costs over time with annual increase estimates.",
};

export default function HOAFeeTrackerLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
