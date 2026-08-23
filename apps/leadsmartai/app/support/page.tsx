import type { Metadata } from "next";
import CustomerSupportChat from "@/components/support/CustomerSupportChat";

export const metadata: Metadata = {
  title: "Customer Support",
  description: "Chat with CloseBoss support — pricing, billing, technical help, and leads.",
};

export default function SupportPage() {
  return <CustomerSupportChat />;
}
