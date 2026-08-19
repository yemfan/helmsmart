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

/** Write the source in, run `args`, hand back the output bytes, always clean up. */
async function withFile<T>(
  file: File,
  output: string,
  args: (input: string, output: string) => string[],
  // Uint8Array<ArrayBuffer>, not plain Uint8Array: the default arg is
  // ArrayBufferLike, which File/Blob reject because it may be shared.
  read: (bytes: Uint8Array<ArrayBuffer>) => T,
): Promise<T> {
  const ff = await engine();
  const ext = /\.(\w{2,4})$/.exec(file.name)?.[1]?.toLowerCase() || "mp4";
  const input = `in.${ext}`;
  const { fetchFile } = await import("@ffmpeg/util");
  await ff.writeFile(input, await fetchFile(file));
  try {
    await ff.exec(args(input, output));
    const data = (await ff.readFile(output)) as Uint8Array;
    if (!data?.byteLength) throw new Error("ffmpeg produced an empty file.");
    // Copy off the wasm heap: readFile hands back a view that the next command
    // reuses, which would corrupt whatever we pass along. Copying into a fresh
    // ArrayBuffer (rather than just re-wrapping) also keeps the result usable
    // as a BlobPart — the heap may be a SharedArrayBuffer, which File rejects.
    const copy = new Uint8Array(new ArrayBuffer(data.byteLength));
    copy.set(data);
    return read(copy);
  } finally {
    await ff.deleteFile(input).catch(() => {});
    await ff.deleteFile(output).catch(() => {});
  }
}

/**
 * Cut `seconds` of a clip starting at `startSec`.
 *
 * Uses `-c copy`, so no frames are re-encoded: the cut is near-instant and the
 * picture is bit-identical to the source.
 *
 * Two consequences of a stream copy, both measured on 2026-08-19:
 *   - the length OVERSHOOTS, +0.13s for a 2s and a 3s request, and further on
 *     a clip with sparse keyframes. Ask for less than the real ceiling.
 *   - the start SNAPS to the nearest preceding keyframe, so the window can
 *     begin slightly earlier than asked.
 * Re-measure the result; do not assume you got exactly what you requested.
 */
export async function trimSection(file: File, startSec: number, seconds: number): Promise<File> {
  const start = Math.max(0, startSec);
  const bytes = await withFile(
    file,
    "out.mp4",
    (input, output) => [
      // -ss BEFORE -i seeks by index instead of decoding everything up to the
      // mark — the difference between instant and tens of seconds on a long clip.
      "-ss",
      String(start),
      "-t",
      String(seconds),
      "-i",
      input,
      "-c",
      "copy",
      // Move the index to the front so the result is seekable — the <video>
      // element needs it to report a duration for our own length check.
      "-movflags",
      "+faststart",
      output,
    ],
    (b) => b,
  );
  const base = file.name.replace(/\.\w{2,4}$/, "");
  const tag = start > 0 ? `-from-${Math.round(start)}s` : "";
  return new File([bytes], `${base}${tag}-${Math.round(seconds)}s.mp4`, { type: "video/mp4" });
}

/** Keep the opening — the common case, and what the old call site expected. */
export function trimToFirstSeconds(file: File, seconds: number): Promise<File> {
  return trimSection(file, 0, seconds);
}

/**
 * Find where the quietest `seconds`-long stretch of a clip begins.
 *
 * A face/person swap has to invent lip movement, and the seam shows most while
 * someone is talking — so a stretch with no speech in it is usually the better
 * section to hand the model.
 *
 * Decodes the audio to raw mono PCM with ffmpeg rather than Web Audio's
 * decodeAudioData, which is unreliable when handed a video container. Loudness
 * is mean absolute amplitude over a sliding window; that is enough to tell
 * speech from room tone, and nothing here needs to be subtler than that.
 *
 * Returns 0 when the clip has no audio track, is too short to slide, or the
 * decode fails — the opening is always a valid answer.
 */
export async function findQuietestStart(
  file: File,
  seconds: number,
  durationSec: number,
): Promise<number> {
  const latestStart = durationSec - seconds;
  if (!(latestStart > 0.25)) return 0;

  const RATE = 8000; // speech sits well below 4kHz; more samples buy nothing here
  let pcm: Int16Array;
  try {
    pcm = await withFile(
      file,
      "audio.raw",
      (input, output) => [
        "-i",
        input,
        "-vn",
        "-ac",
        "1",
        "-ar",
        String(RATE),
        "-f",
        "s16le",
        output,
      ],
      (b) => new Int16Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 2)),
    );
  } catch {
    return 0; // silent clip, no audio stream, or an unreadable one — open at 0
  }
  if (pcm.length < RATE) return 0;

  const windowLen = Math.floor(seconds * RATE);
  if (pcm.length <= windowLen) return 0;
  const step = Math.floor(RATE / 4); // slide a quarter-second at a time

  // Prefix sums of |sample| so each window costs two lookups instead of a scan.
  const prefix = new Float64Array(pcm.length + 1);
  for (let i = 0; i < pcm.length; i += 1) prefix[i + 1] = prefix[i] + Math.abs(pcm[i]);

  const lastOffset = Math.min(pcm.length - windowLen, Math.floor(latestStart * RATE));
  let bestOffset = 0;
  let bestLoudness = Infinity;
  for (let offset = 0; offset <= lastOffset; offset += step) {
    const loudness = prefix[offset + windowLen] - prefix[offset];
    if (loudness < bestLoudness) {
      bestLoudness = loudness;
      bestOffset = offset;
    }
  }
  // Round to a quarter-second: the UI shows this number, and false precision
  // ("starts at 7.3281s") reads like a bug rather than a suggestion.
  return Math.round((bestOffset / RATE) * 4) / 4;
}
