import type { Metadata } from "next";
import AiTeamClient from "./AiTeamClient";

export const metadata: Metadata = {
  title: "Manage AI Team",
  description: "Configure your RealtyBoss AI team — pause assistants and choose their skills.",
  robots: { index: false },
};

export default function AiTeamPage() {
  return <AiTeamClient />;
}
