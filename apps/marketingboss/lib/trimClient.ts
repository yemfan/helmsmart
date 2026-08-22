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

/** Kling O1 accepts 24-60 fps. 30 is the safe middle and a normal delivery rate. */
export const TARGET_FPS = 30;

/**
 * Re-encode a clip to something the swap model will accept, optionally keeping
 * only a section of it.
 *
 * This RE-ENCODES rather than stream-copying, which was the first attempt.
 * Copying is ~150x faster (41ms vs 5.9s on a real 30s clip) but cannot deliver
 * either guarantee we need, measured on a user's actual file:
 *   - length: a copy cuts on a keyframe, so a 9s request returned 9.28s on that
 *     clip and 12.47s from a different start. Encoding returned 9.03s.
 *   - frame rate: a copy preserves the source's, so a 16.87fps clip stayed
 *     16.87fps and fal rejected it for being under its 24fps floor. Encoding
 *     normalises to exactly 30.
 * Six seconds of the user's time is a fair trade for not failing after upload.
 */
export async function conformClip(
  file: File,
  opts: { startSec?: number; seconds?: number } = {},
): Promise<File> {
  const start = Math.max(0, opts.startSec ?? 0);
  const bytes = await withFile(
    file,
    "out.mp4",
    (input, output) => [
      // -ss BEFORE -i seeks by index instead of decoding up to the mark.
      ...(start > 0 ? ["-ss", String(start)] : []),
      ...(opts.seconds ? ["-t", String(opts.seconds)] : []),
      "-i",
      input,
      "-r",
      String(TARGET_FPS),
      "-c:v",
      "libx264",
      // veryfast keeps the wait tolerable in wasm; crf 20 is visually clean.
      "-preset",
      "veryfast",
      "-crf",
      "20",
      // Some sources decode to a pixel format H.264 players choke on.
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      // Index at the front so the result is seekable — the <video> element
      // needs it to report a duration for our own length check.
      "-movflags",
      "+faststart",
      output,
    ],
    (b) => b,
  );
  const base = file.name.replace(/\.\w{2,4}$/, "");
  const tag = start > 0 ? `-from-${Math.round(start)}s` : "";
  return new File([bytes], `${base}${tag}-ready.mp4`, { type: "video/mp4" });
}

/** Keep `seconds` starting at `startSec`, normalising the frame rate too. */
export function trimSection(file: File, startSec: number, seconds: number): Promise<File> {
  return conformClip(file, { startSec, seconds });
}

/** Fix only the frame rate — for a clip already short enough to swap. */
export function normalizeFrameRate(file: File): Promise<File> {
  return conformClip(file);
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

/**
 * Average frame rate of an MP4, read straight from its boxes.
 *
 * Deliberately parses the container by hand instead of asking ffmpeg: the fps
 * check runs on EVERY picked clip, and loading the ~30MB wasm core just to read
 * a header would make the common case pay for the rare one. No decoding happens
 * here — it walks moov/trak to the video track and divides its frame count by
 * its duration.
 *
 * Returns null for anything it cannot read (a non-MP4, a fragmented file, a
 * truncated header), which callers must treat as "unknown", never as "bad".
 */
export async function readMp4Fps(file: File): Promise<number | null> {
  // The header is at one end or the other; 2MB from each covers both layouts
  // without pulling a 200MB file into memory.
  const EDGE = 2 * 1024 * 1024;
  const head = new Uint8Array(await file.slice(0, Math.min(EDGE, file.size)).arrayBuffer());
  const fromHead = fpsFromMp4(head);
  if (fromHead !== null) return fromHead;
  if (file.size <= EDGE) return null;
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - EDGE)).arrayBuffer());
  return fpsFromMp4(tail);
}

function fpsFromMp4(buf: Uint8Array): number | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tag = (p: number) => String.fromCharCode(buf[p], buf[p + 1], buf[p + 2], buf[p + 3]);
  const children = (start: number, end: number) => {
    const out: { type: string; start: number; end: number }[] = [];
    let p = start;
    while (p + 8 <= end) {
      let size = dv.getUint32(p);
      let hdr = 8;
      const type = tag(p + 4);
      if (size === 1) {
        if (p + 16 > end) break;
        size = Number(dv.getBigUint64(p + 8));
        hdr = 16;
      }
      if (size === 0) size = end - p;
      if (size < hdr || p + size > end) break;
      out.push({ type, start: p + hdr, end: p + size });
      p += size;
    }
    return out;
  };
  const pick = (l: { type: string; start: number; end: number }[], t: string) =>
    l.find((b) => b.type === t);

  try {
    const moov = pick(children(0, buf.length), "moov");
    if (!moov) return null;
    for (const trak of children(moov.start, moov.end).filter((b) => b.type === "trak")) {
      const mdia = pick(children(trak.start, trak.end), "mdia");
      if (!mdia) continue;
      const md = children(mdia.start, mdia.end);
      const hdlr = pick(md, "hdlr");
      // The handler type sits after version+flags and a reserved word.
      if (!hdlr || tag(hdlr.start + 8) !== "vide") continue;
      const mdhd = pick(md, "mdhd");
      const minf = pick(md, "minf");
      if (!mdhd || !minf) return null;
      const v = buf[mdhd.start];
      const timescale = v === 1 ? dv.getUint32(mdhd.start + 20) : dv.getUint32(mdhd.start + 12);
      const duration =
        v === 1 ? Number(dv.getBigUint64(mdhd.start + 24)) : dv.getUint32(mdhd.start + 16);
      const stbl = pick(children(minf.start, minf.end), "stbl");
      if (!stbl) return null;
      const stsz = pick(children(stbl.start, stbl.end), "stsz");
      if (!stsz) return null;
      const frames = dv.getUint32(stsz.start + 8);
      const secs = duration / timescale;
      if (!(secs > 0) || !(frames > 0)) return null;
      return frames / secs;
    }
  } catch {
    return null; // a malformed box tree is "unknown", not "bad"
  }
  return null;
}

/**
 * Find the shot boundaries in a clip, in seconds.
 *
 * Runs here rather than asking the analyzer model to infer cuts from stills.
 * Measured 2026-08-22 on a 30s five-shot ad: from 16 frames the model found
 * every real boundary but invented five more, reading a gimbal move inside a
 * shot as a new setup — and then described the ad's pacing as "~2s cuts" when
 * it averages 6s. Differencing frames is exact, costs one ffmpeg pass, and
 * leaves the model doing only the part it is good at: describing what a shot
 * contains.
 *
 * Decodes to 64x64 greyscale at 4fps and compares neighbours. A cut is a jump
 * far above the clip's own typical frame-to-frame movement, so the threshold is
 * relative to the median: a locked-off interview and a handheld walk-and-talk
 * have very different baselines and a fixed number would over-cut one and miss
 * the other. The floor stops a near-static clip, whose median can be ~3, from
 * calling every flicker a cut.
 *
 * Tuned to favour RECALL over precision, which is not the obvious default. A
 * false cut splits one shot into two with the same description, and the recast
 * just generates two clips instead of one — it degrades gracefully. A MISSED
 * cut merges two settings into a single shot, and every description of that
 * shot is then internally contradictory. Over-detecting is the cheaper error.
 *
 * Measured 2026-08-22 against ffmpeg scene detection on a 30s five-shot ad
 * (heavy handheld motion, median frame diff 17): 4/4 cuts found, 1 false
 * positive on a foreground foliage wipe. A stricter multiple lost two real cuts.
 */
export async function detectCuts(file: File): Promise<number[]> {
  const FPS = 4;
  const SIDE = 64;
  const AREA = SIDE * SIDE;

  let gray: Uint8Array;
  try {
    gray = await withFile(
      file,
      "gray.raw",
      (input, output) => [
        "-i",
        input,
        "-vf",
        `fps=${FPS},scale=${SIDE}:${SIDE},format=gray`,
        "-an",
        "-f",
        "rawvideo",
        output,
      ],
      (b) => b,
    );
  } catch {
    return []; // unreadable video — "no cuts measured" is a valid answer
  }

  const frames = Math.floor(gray.byteLength / AREA);
  if (frames < 3) return [];

  const diffs: number[] = [];
  for (let f = 1; f < frames; f += 1) {
    const a = (f - 1) * AREA;
    const b = f * AREA;
    let sum = 0;
    for (let i = 0; i < AREA; i += 1) sum += Math.abs(gray[a + i] - gray[b + i]);
    diffs.push(sum / AREA);
  }

  // Median as the baseline: a mean would be dragged up by the cuts themselves.
  const sorted = [...diffs].sort((x, y) => x - y);
  const median = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(median * 2.5, 30);

  const cuts: number[] = [];
  for (let i = 0; i < diffs.length; i += 1) {
    if (diffs[i] < threshold) continue;
    const at = (i + 1) / FPS;
    // A cross-fade trips several neighbouring frames; keep the first only.
    if (cuts.length && at - cuts[cuts.length - 1] < 0.6) continue;
    cuts.push(Number(at.toFixed(2)));
  }
  return cuts;
}

/**
 * Grab one still per shot, as base64 JPEG, for the analyzer to look at.
 *
 * Samples the MIDDLE of each shot rather than its start: the first frames after
 * a cut are where a cross-fade is still resolving, and a transition frame
 * describes neither shot. Extra evenly-spaced stills are added when there are
 * few shots, so a two-shot ad still shows the model enough to read.
 *
 * JPEG, not PNG, and deliberately small. These are posted to our own API as
 * base64 inside a JSON body, and a Vercel function rejects a request body over
 * ~4.5MB — sixteen 360px PNGs base64-encode to roughly that on their own. JPEG
 * at q4 is about a sixth of the size and loses nothing that matters for reading
 * a shot list.
 */
export async function sampleShotFrames(
  file: File,
  durationSec: number,
  cuts: number[],
  minFrames = 8,
): Promise<{ atSec: number; base64: string; mediaType: string }[]> {
  const bounds = [0, ...cuts, durationSec];
  const times: number[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) times.push((bounds[i] + bounds[i + 1]) / 2);
  for (let i = 1; times.length < minFrames && i < minFrames * 2; i += 1) {
    const at = Number(((durationSec * i) / (minFrames + 1)).toFixed(2));
    if (!times.some((t) => Math.abs(t - at) < 0.4)) times.push(at);
  }
  times.sort((a, b) => a - b);

  const out: { atSec: number; base64: string; mediaType: string }[] = [];
  for (const atSec of times) {
    const bytes = await withFile(
      file,
      "frame.jpg",
      (input, output) => ["-ss", String(atSec), "-i", input, "-frames:v", "1", "-vf", "scale=360:-1", "-q:v", "4", output],
      (b) => b,
    ).catch(() => null);
    if (!bytes) continue;
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    out.push({ atSec: Number(atSec.toFixed(2)), base64: btoa(binary), mediaType: "image/jpeg" });
  }
  return out;
}
