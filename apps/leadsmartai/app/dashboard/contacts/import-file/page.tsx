import ImportFileClient from "./ImportFileClient";

export const metadata = {
  title: "AI Import Contacts | RealtyBoss",
  description:
    "Extract contacts from a PDF, image, or text file using AI, then preview and edit before saving.",
  robots: { index: false },
};

export default function ImportFilePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <ImportFileClient />
    </div>
  );
}
