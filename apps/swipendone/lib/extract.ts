// Server-only text extraction for uploaded manuals (handoff §5 wizard step 1).

export async function extractManualText(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const lower = filename.toLowerCase();
  try {
    if (lower.endsWith(".pdf")) {
      const pdfParse = (await import("pdf-parse")).default;
      const data = await pdfParse(buffer);
      return (data.text || "").trim();
    }
    if (lower.endsWith(".docx")) {
      const mammoth = await import("mammoth");
      const { value } = await mammoth.extractRawText({ buffer });
      return (value || "").trim();
    }
    // txt or anything else: best-effort utf-8
    return buffer.toString("utf-8").trim();
  } catch {
    // Extraction is best-effort; a failed parse shouldn't block generation.
    return "";
  }
}
