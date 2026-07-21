import ScanCardClient from "./ScanCardClient";

export const metadata = {
  title: "Scan Business Card | CloseBoss",
  description: "Scan a business card to add a contact to CloseBoss.",
};

export default function ScanCardPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <ScanCardClient />
    </div>
  );
}
