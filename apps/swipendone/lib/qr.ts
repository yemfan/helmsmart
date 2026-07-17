import QRCode from "qrcode";
import { appUrl } from "@/lib/env";

export function guideUrl(slug: string): string {
  return `${appUrl()}/g/${slug}`;
}

/** Print-ready PNG buffer (1200px, high error correction for packaging). */
export async function qrPngBuffer(slug: string): Promise<Buffer> {
  return QRCode.toBuffer(guideUrl(slug), {
    type: "png",
    width: 1200,
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#1C2B24", light: "#FFFFFF" },
  });
}

/** SVG string for scalable download. */
export async function qrSvgString(slug: string): Promise<string> {
  return QRCode.toString(guideUrl(slug), {
    type: "svg",
    margin: 2,
    errorCorrectionLevel: "H",
    color: { dark: "#1C2B24", light: "#FFFFFF" },
  });
}
