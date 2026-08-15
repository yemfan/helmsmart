/**
 * Pull the audio track out of a video, in the browser, before upload.
 *
 * WHY THIS EXISTS
 * ElevenLabs rejects voice-clone uploads over 11MB, and a normal intro video is
 * ~18MB — so the sample had to be shrunk somehow. The first fix ran it through
 * ElevenLabs' audio-isolation endpoint, which does fit under the cap but is a
 * DENOISER: it reshapes the voice, and the resulting clones came back sounding
 * processed rather than natural.
 *
 * Extracting the audio track is the honest fix. The voice is untouched; only the
 * video (which the cloner never needed) is discarded. A minute of speech lands
 * around 1-2MB instead of 18MB.
 *
 * WHY IN THE BROWSER
 * fal's ffmpeg-api can't emit audio-only (compose returns `video_url`), and
 * bundling ffmpeg into a serverless function is far too heavy. The file is
 * already on the agent's machine — transcoding there costs us nothing, uploads
 * ~10x less, and keeps the whole thing off the database's back.
 *
 * Output is 22.05kHz mono 16-bit WAV: plenty for voice cloning (speech lives
 * well under 11kHz), a fraction of the size of the source, and lossless from
 * the decoded samples so we add no artefacts of our own.
 */

/** Speech needs nothing above ~11kHz, so 22.05kHz captures it with headroom. */
const TARGET_SAMPLE_RATE = 22_050;

export class AudioExtractionUnsupportedError extends Error {
  constructor() {
    super("This browser can't read the audio from that video.");
    this.name = "AudioExtractionUnsupportedError";
  }
}

/** Interleave nothing — we downmix to mono, which is what cloning wants anyway. */
function encodeWavMono(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeText = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  const dataBytes = samples.length * bytesPerSample;
  writeText(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeText(8, "WAVE");
  writeText(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // channels = mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeText(36, "data");
  view.setUint32(40, dataBytes, true);

  // Float [-1,1] → signed 16-bit, clamped so any inter-sample overshoot from
  // resampling doesn't wrap around into a click.
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Decode `file`'s audio, downmix to mono, resample to 22.05kHz and return a WAV
 * File ready to upload.
 *
 * Throws AudioExtractionUnsupportedError when the browser can't decode the
 * container — callers should fall back to uploading the video itself rather
 * than blocking the agent.
 */
export async function extractVoiceSample(file: File): Promise<File> {
  const AudioCtx =
    typeof window !== "undefined"
      ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!AudioCtx) throw new AudioExtractionUnsupportedError();

  const bytes = await file.arrayBuffer();

  // A plain AudioContext decodes the whole file's audio track regardless of the
  // video container; we never touch the video stream.
  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(bytes);
  } catch {
    throw new AudioExtractionUnsupportedError();
  } finally {
    // Chrome caps concurrent AudioContexts; never leak one.
    void decodeCtx.close().catch(() => {});
  }

  if (!decoded.length) throw new AudioExtractionUnsupportedError();

  // Resample + downmix in one pass. OfflineAudioContext does the rate
  // conversion properly (filtered), rather than the aliasing mess that
  // dropping samples by hand would produce.
  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();

  const wav = encodeWavMono(rendered.getChannelData(0), TARGET_SAMPLE_RATE);
  return new File([wav], "intro-audio.wav", { type: "audio/wav" });
}
