// Pull the pictures out of a PDF, in the browser, with pdf.js.
//
// Two strategies, in order:
//   1. figures — extract embedded raster images (the actual diagrams/photos),
//      which crop tightly and carry no surrounding page text.
//   2. pages   — rasterize whole pages. Needed when a manual's artwork is
//      vector line art, which has no embedded images to extract.
//
// Runs client-side because Vercel can't run poppler/ImageMagick, and it keeps
// large files off the server entirely.

type PdfModule = typeof import("pdfjs-dist");

async function loadPdfjs(): Promise<PdfModule> {
  const pdfjs = await import("pdfjs-dist");
  // Served from public/ — `new URL(..., import.meta.url)` doesn't resolve at
  // runtime here, which leaves pdf.js hanging with no worker. Keep
  // public/pdf.worker.min.mjs in sync with the pinned pdfjs-dist version.
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return pdfjs;
}

function canvasToFile(canvas: HTMLCanvasElement, name: string, quality: number) {
  return new Promise<File | null>((resolve) =>
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], name, { type: "image/jpeg" }) : null),
      "image/jpeg",
      quality
    )
  );
}

/** pdf.js image object → JPEG file (handles bitmaps and raw RGBA/RGB/1bpp data). */
async function imageObjectToFile(
  obj: unknown,
  name: string,
  quality: number
): Promise<File | null> {
  const o = obj as {
    width?: number;
    height?: number;
    kind?: number;
    data?: Uint8Array | Uint8ClampedArray;
    bitmap?: CanvasImageSource & { width: number; height: number };
  };
  const w = o.bitmap?.width ?? o.width ?? 0;
  const h = o.bitmap?.height ?? o.height ?? 0;
  if (!w || !h) return null;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, w, h);

  if (o.bitmap) {
    ctx.drawImage(o.bitmap, 0, 0);
  } else if (o.data) {
    const src = o.data;
    const img = ctx.createImageData(w, h);
    const dst = img.data;
    if (o.kind === 3 && src.length >= w * h * 4) {
      dst.set(src.subarray(0, w * h * 4)); // RGBA_32BPP
    } else if (o.kind === 2 && src.length >= w * h * 3) {
      for (let i = 0, j = 0; j < dst.length; i += 3, j += 4) {
        dst[j] = src[i];
        dst[j + 1] = src[i + 1];
        dst[j + 2] = src[i + 2];
        dst[j + 3] = 255;
      }
    } else if (o.kind === 1) {
      const rowBytes = (w + 7) >> 3; // GRAYSCALE_1BPP, rows byte-aligned
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const byte = src[y * rowBytes + (x >> 3)] ?? 0;
          const v = (byte >> (7 - (x & 7))) & 1 ? 255 : 0;
          const j = (y * w + x) * 4;
          dst[j] = dst[j + 1] = dst[j + 2] = v;
          dst[j + 3] = 255;
        }
      }
    } else {
      return null;
    }
    ctx.putImageData(img, 0, 0);
  } else {
    return null;
  }

  return canvasToFile(canvas, `${name}.jpg`, quality);
}

/** Embedded figures, largest-first. Empty when the artwork is vector-only. */
export async function extractPdfFigures(
  file: File,
  opts: { maxPages?: number; maxImages?: number; minSide?: number; quality?: number } = {}
): Promise<File[]> {
  const { maxPages = 20, maxImages = 12, minSide = 120, quality = 0.85 } = opts;
  if (!/\.pdf$/i.test(file.name)) return [];

  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: File[] = [];
  const seen = new Set<string>();

  try {
    const pageCount = Math.min(doc.numPages, maxPages);
    for (let n = 1; n <= pageCount && out.length < maxImages; n++) {
      const page = await doc.getPage(n);
      const ops = await page.getOperatorList();
      const names: string[] = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i];
        // v4 routes JPEGs through paintImageXObject too.
        if (fn === pdfjs.OPS.paintImageXObject) {
          const arg = ops.argsArray[i]?.[0];
          if (typeof arg === "string") names.push(arg);
        }
      }

      for (const name of names) {
        if (out.length >= maxImages) break;
        const obj = await new Promise<unknown>((resolve) => {
          let settled = false;
          const done = (v: unknown) => {
            if (!settled) {
              settled = true;
              resolve(v);
            }
          };
          try {
            const store = page.objs.has(name) ? page.objs : page.commonObjs;
            store.get(name, done);
          } catch {
            done(null);
          }
          setTimeout(() => done(null), 5000); // never hang on an unresolved object
        });
        if (!obj) continue;

        const o = obj as { width?: number; height?: number; bitmap?: { width: number; height: number } };
        const w = o.bitmap?.width ?? o.width ?? 0;
        const h = o.bitmap?.height ?? o.height ?? 0;
        // Skip icons, rules, and logos.
        if (w < minSide || h < minSide) continue;
        const sig = `${w}x${h}`;
        if (seen.has(sig)) continue;
        seen.add(sig);

        const f = await imageObjectToFile(obj, `figure-${n}-${out.length + 1}`, quality);
        if (f) out.push(f);
      }
    }
  } finally {
    await doc.destroy().catch(() => {});
  }
  return out;
}

/** Rendered page images, in page order. */
export async function renderPdfPages(
  file: File,
  opts: { maxPages?: number; maxWidth?: number; quality?: number } = {}
): Promise<File[]> {
  const { maxPages = 12, maxWidth = 1400, quality = 0.85 } = opts;
  if (!/\.pdf$/i.test(file.name)) return [];

  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: File[] = [];

  try {
    const count = Math.min(doc.numPages, maxPages);
    for (let n = 1; n <= count; n++) {
      const page = await doc.getPage(n);
      const unscaled = page.getViewport({ scale: 1 });
      const scale = Math.min(2, maxWidth / unscaled.width);
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      // Manuals are usually line art on white; fill so transparency isn't black.
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // `intent: "print"` makes pdf.js skip its requestAnimationFrame loop, so
      // rendering still completes if the tab is backgrounded (rAF is throttled
      // to zero there, which otherwise hangs the render forever).
      await page.render({ canvasContext: ctx, viewport, intent: "print" }).promise;

      const f = await canvasToFile(canvas, `page-${n}.jpg`, quality);
      if (f) pages.push(f);
    }
  } finally {
    await doc.destroy().catch(() => {});
  }
  return pages;
}

/**
 * Best available pictures from a PDF: tightly-cropped embedded figures when the
 * manual has them, otherwise whole-page renders.
 */
export async function extractPdfVisuals(
  file: File,
  opts: { maxImages?: number } = {}
): Promise<{ files: File[]; mode: "figures" | "pages" | "none" }> {
  const { maxImages = 12 } = opts;
  try {
    const figures = await extractPdfFigures(file, { maxImages });
    if (figures.length > 0) return { files: figures, mode: "figures" };
  } catch {
    // fall through to page rendering
  }
  try {
    const pages = await renderPdfPages(file, { maxPages: maxImages });
    return { files: pages, mode: pages.length ? "pages" : "none" };
  } catch {
    return { files: [], mode: "none" };
  }
}
