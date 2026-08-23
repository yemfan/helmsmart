import type { LucideIcon } from "lucide-react";

export type PlatformRole = "agent" | "support" | "admin";

export type PlatformNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type PlatformNavSection = {
  label?: string;
  items: PlatformNavItem[];
};
