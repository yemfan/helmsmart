/**
 * Browser-side video trimming (ffmpeg.wasm).
 *
 * Why this runs in the browser rather than on the server:
 *   - fal's ffmpeg-api CANNOT cut video. Its compose endpoint takes a keyframe
 *     `duration`, but that only controls how long a still IMAGE is held; for a
 *     video track the source plays in full. Measured against a 5.10s clip on
 *     2026-08-19 — asking for 2.0s returned 5.10s, as did `start_from`,
 *     `trim_start`/`trim_end`, and a top-level `duration`.
 *   - Bundling a real ffmpeg into a serverless function is far too heavy (the
 *     same conclusion CloseBoss reached in lib/audio/extractVoiceSample.ts).
 *
 * So the cut happens on the file the user already has, before it is uploaded.
 * Everything is loaded dynamically: the ~30MB core is fetched only when someone
 * actually picks an over-long clip, and never enters the main bundle or SSR.
 */

/** Pinned to the core that matches @ffmpeg/ffmpeg 0.12.x — a mismatch fails to load. */
const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

type FFmpegInstance = {
  load: (opts: { coreURL: string; wasmURL: string }) => Promise<unknown>;
  writeFile: (name: string, data: Uint8Array) => Promise<unknown>;
  readFile: (name: string) => Promise<unknown>;
  deleteFile: (name: string) => Promise<unknown>;
  exec: (args: string[]) => Promise<unknown>;
};

/** One instance per tab — loading the core twice would refetch ~30MB. */
let enginePromise: Promise<FFmpegInstance> | null = null;

async function engine(): Promise<FFmpegInstance> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ff = new FFmpeg() as unknown as FFmpegInstance;
      await ff.load({
        coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, "application/wasm"),
      });
      return ff;
    })().catch((e) => {
      // Don't cache a failed load — the next attempt should be able to retry.
      enginePromise = null;
      throw e;
    });
  }
  return enginePromise;
}

/**
 * Keep the first `seconds` of a clip.
 *
 * Uses `-c copy`, so no frames are re-encoded: the cut is near-instant and the
 * picture is bit-identical to the source.
 *
 * The tradeoff is that a stream copy can only cut on a keyframe, so the result
 * OVERSHOOTS slightly — measured at +0.13s for both a 2s and a 3s request on
 * 2026-08-19, and potentially more on a clip with sparser keyframes. Ask for
 * less than the real ceiling and re-measure the result; do not assume you got
 * exactly what you requested.
 */
export async function trimToFirstSeconds(file: File, seconds: number): Promise<File> {
  const ff = await engine();
  const ext = /\.(\w{2,4})$/.exec(file.name)?.[1]?.toLowerCase() || "mp4";
  const input = `in.${ext}`;
  const output = "out.mp4";

  const { fetchFile } = await import("@ffmpeg/util");
  await ff.writeFile(input, await fetchFile(file));
  try {
    await ff.exec([
      // -ss before -i seeks by index instead of decoding up to the mark.
      "-ss",
      "0",
      "-t",
      String(seconds),
      "-i",
      input,
      "-c",
      "copy",
      // Move the index to the front so the result is seekable/streamable — the
      // <video> element needs it to report a duration for our own size check.
      "-movflags",
      "+faststart",
      output,
    ]);
    const data = (await ff.readFile(output)) as Uint8Array;
    if (!data?.byteLength) throw new Error("Trimming produced an empty file.");
    const base = file.name.replace(/\.\w{2,4}$/, "");
    // Copy into a fresh buffer: ffmpeg.wasm hands back a view over its heap,
    // which is reused by the next command and would corrupt the upload.
    const bytes = new Uint8Array(data);
    return new File([bytes], `${base}-first-${Math.round(seconds)}s.mp4`, { type: "video/mp4" });
  } finally {
    // Free the heap whether or not the cut worked — a second attempt in the
    // same tab reuses this instance.
    await ff.deleteFile(input).catch(() => {});
    await ff.deleteFile(output).catch(() => {});
  }
}
