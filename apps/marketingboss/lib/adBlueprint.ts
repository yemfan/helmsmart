import "server-only";
import { anthropicJson } from "@/lib/ai";
import { personaBlock, type Character } from "@/lib/characters";
import { transcribeMedia } from "@/lib/transcribeMedia";

/**
 * Read a reference ad's structure, then re-shoot it with the user's own twin.
 *
 * This is the alternative to Swap, and it exists because Swap cannot do this
 * job. Swap is a video-to-video EDIT: it inherits the source clip's length
 * (Kling O1 accepts 3-10s, so a 30s ad is cut to 9), keeps the source's audio,
 * and re-renders a face over motion that was filmed for someone else. Worse,
 * its prompt says "replace the face of the main person" — so when the chosen
 * seconds contain a shot with NO person in frame, the model does not skip
 * those frames, it invents a person and a scene to put them in. Measured
 * 2026-08-22 on a real user render: the source window held an exterior car
 * shot with nobody in it, and the output's first four seconds were fabricated
 * interior footage with no relationship to the retained audio.
 *
 * So this path stops editing footage and starts rebuilding it:
 *
 *   1. analyzeAd()      reference clip -> a shot-by-shot blueprint
 *   2. recastForTwin()  blueprint + the twin -> per-shot render instructions
 *   3. (caller)         talking shots -> veed/fabric-1.0 (portrait + cloned
 *                       voice), b-roll shots -> Seedance text-to-video,
 *                       assembled with fal-ai/ffmpeg-api/merge-videos
 *
 * The split in step 3 is the whole trick. Seedance 2.5 REFUSES a human-face
 * reference outright (`content_policy_violation`, measured 2026-08-19), which
 * is why the UGC path falls back to 2.0 and its 15s ceiling. Fabric does not
 * refuse, because a portrait is its input rather than a reference — see
 * lib/avatar.ts. Keep the twin's face inside Fabric and out of Seedance and
 * neither limit applies: real lip sync from real audio, and no 15s cap.
 */

export type ShotKind = "talking" | "broll";

/**
 * How much of the presenter a shot actually shows.
 *
 * This drives the routing, so it is not decoration. A face that is front-on
 * has to come from Fabric, where identity is pinned to the portrait; a
 * generative model asked for the same face across five shots will drift. Ads
 * like the reference we studied already solve this in their own grammar — the
 * shots that are hardest to keep consistent are shot from behind or far away.
 */
export type PresenterFraming = "front" | "profile" | "back" | "distant" | "absent";

export type BlueprintShot = {
  index: number;
  startSec: number;
  endSec: number;
  kind: ShotKind;
  /** Where it happens — location, time of day, notable props. */
  setting: string;
  /** Framing and movement, as a director would note it. */
  camera: string;
  presenterFraming: PresenterFraming;
  /** The voiceover heard over this shot; empty when the shot is silent. */
  line: string;
};

export type AdBlueprint = {
  durationSec: number;
  aspect: string;
  /** The opening beat, verbatim — what earns the next two seconds. */
  hook: string;
  /** The full voiceover as one piece of copy. */
  script: string;
  /** The persuasion structure, e.g. "contrarian claim -> reframe -> proof". */
  arc: string;
  /** The reusable pattern: pacing, energy, visual vocabulary. */
  formatDna: string;
  /** What holds identity together across cuts — usually one outfit. */
  wardrobeAnchor: string;
  /** Burned-in caption treatment, described so we can rebuild it as a track. */
  captionStyle: string;
  shots: BlueprintShot[];
};

const FRAMING = ["front", "profile", "back", "distant", "absent"] as const;

const BLUEPRINT_SCHEMA = {
  type: "object",
  properties: {
    aspect: { type: "string" },
    hook: { type: "string" },
    script: { type: "string" },
    arc: { type: "string" },
    formatDna: { type: "string" },
    wardrobeAnchor: { type: "string" },
    captionStyle: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          startSec: { type: "number" },
          endSec: { type: "number" },
          kind: { type: "string", enum: ["talking", "broll"] },
          setting: { type: "string" },
          camera: { type: "string" },
          presenterFraming: { type: "string", enum: FRAMING },
          line: { type: "string" },
        },
        required: ["startSec", "endSec", "kind", "setting", "camera", "presenterFraming", "line"],
        additionalProperties: false,
      },
    },
  },
  required: ["aspect", "hook", "script", "arc", "formatDna", "wardrobeAnchor", "captionStyle", "shots"],
  additionalProperties: false,
};

/**
 * A still sampled from the reference, with the second it was taken at.
 *
 * Either a `url` the API can fetch, or inline `base64` — the browser samples
 * frames with ffmpeg.wasm and already holds the bytes, so uploading them just
 * to have the API fetch them back would be a round trip for nothing.
 */
export type ReferenceFrame = {
  atSec: number;
  url?: string;
  base64?: string;
  mediaType?: string;
};

/**
 * Deconstruct a reference ad into a blueprint.
 *
 * `frames` must be in time order and should cover the whole clip — the model
 * can only place a cut between two frames it was shown, so the sampling
 * interval is the resolution of the shot list. Twelve to twenty stills across
 * a 30s ad puts boundaries within about a second, which is close enough to
 * rebuild from.
 *
 * The transcript is fetched here rather than passed in because the caller
 * already has the clip URL, and the two must describe the same file.
 */
export async function analyzeAd(opts: {
  videoUrl: string;
  frames: ReferenceFrame[];
  durationSec: number;
  /** Skip the wizper call when the caller already transcribed this clip. */
  transcript?: string;
  /**
   * Shot boundaries in seconds, if the caller detected them.
   *
   * Strongly recommended. Measured 2026-08-22 against a 30s five-shot ad: asked
   * to infer cuts from 16 stills, the model found all five real boundaries but
   * invented five more, reading camera movement inside a shot as a new setup —
   * 10 shots for 5, which then reported the ad's pacing as "~2s cuts" when it
   * actually averages 6s. Frame differencing gets this exactly right and costs
   * nothing, so detect the cuts and pass them; the model is then only asked to
   * describe shots, which is the part it is good at.
   */
  cuts?: number[];
}): Promise<AdBlueprint> {
  if (opts.frames.length < 4) {
    throw new Error("Not enough frames to read a shot list from — sample at least four.");
  }

  // A silent reference is still analysable: the visual pattern is most of what
  // gets reused. Only the script comes out empty, so say so rather than throw.
  const transcript = opts.transcript ?? (await transcribeMedia(opts.videoUrl).catch(() => ""));

  const system = [
    "You are a director breaking down a short vertical social ad so it can be re-shot with a different presenter.",
    "You are given stills in time order, each labelled with its timestamp, plus a transcript of the audio.",
    "",
    "SHOT_BOUNDARIES gives the exact seconds where this ad cuts, measured from the video itself. Return exactly one shot per interval between them, with those timestamps. Do not split a shot because the camera moved or the subject turned within it, and do not merge two of them.",
    "If SHOT_BOUNDARIES is absent, infer the cuts yourself: a new shot starts only where the picture cuts to a different setup, and you can only place a boundary at the timestamp of a still you were shown. Camera movement within a continuous take is not a cut.",
    "",
    "For every shot:",
    "- kind: 'talking' if the presenter is visibly speaking to camera in it, otherwise 'broll'.",
    "- presenterFraming: how much of the presenter is visible — 'front' (face to camera), 'profile', 'back' (turned away), 'distant' (small in frame), or 'absent' (not in the shot at all). Be strict: this decides how the shot gets rebuilt.",
    "- setting: location, time of day and the props that carry the look.",
    "- camera: framing and movement, as a director would note it.",
    "- line: the part of the transcript heard over this shot. Split the transcript across shots in order. Empty string when the shot is silent.",
    "",
    "Also return: hook (the opening beat verbatim), script (the full voiceover), arc (the persuasion structure in a short phrase), formatDna (the reusable pattern — pacing, energy, visual vocabulary, in 30-60 words), wardrobeAnchor (what keeps the presenter recognisable across cuts), captionStyle (how burned-in captions look, or an empty string if there are none).",
    "",
    "Describe only what is in the stills and the transcript. Where they do not say, return an empty string rather than a plausible guess.",
  ].join("\n");

  const out = await anthropicJson<Omit<AdBlueprint, "durationSec" | "shots"> & {
    shots: Omit<BlueprintShot, "index">[];
  }>({
    system,
    user: [
      `Clip duration: ${opts.durationSec.toFixed(2)}s`,
      opts.cuts?.length
        ? `SHOT_BOUNDARIES: ${[0, ...opts.cuts, opts.durationSec]
            .map((t) => t.toFixed(2))
            .join(", ")} (${opts.cuts.length + 1} shots)`
        : "SHOT_BOUNDARIES: (not measured — infer them)",
      "",
      transcript ? `Transcript:\n${transcript.slice(0, 6000)}` : "Transcript: (no speech detected)",
    ].join("\n"),
    images: opts.frames.map((f) => ({
      label: `t=${f.atSec.toFixed(2)}s`,
      url: f.url,
      base64: f.base64,
      mediaType: f.mediaType,
    })),
    schema: BLUEPRINT_SCHEMA,
    // Reading a shot list off stills is analysis, not copywriting — the frames
    // have to be compared against each other before any of it can be written.
    effort: "medium",
    maxTokens: 6000,
  });

  const shots = out.shots
    .map((s, i) => ({ ...s, index: i }))
    .filter((s) => s.endSec > s.startSec);
  if (!shots.length) throw new Error("Could not read a shot list from that video.");

  return { ...out, durationSec: opts.durationSec, shots };
}

/** What one rebuilt shot needs, and which renderer it belongs to. */
export type RecastShot = {
  index: number;
  seconds: number;
  /**
   * "avatar" renders through Fabric from the twin's portrait and a cloned-voice
   * take of `line`. "scene" renders through Seedance text-to-video from
   * `prompt`, with no face reference anywhere near it.
   */
  render: "avatar" | "scene";
  /** The words spoken over this shot. Empty for a silent scene. */
  line: string;
  /** Generation prompt — set for "scene", empty for "avatar". */
  prompt: string;
  /** Why it was routed this way, surfaced so the user can override knowingly. */
  reason: string;
};

export type RecastPlan = {
  totalSeconds: number;
  aspect: string;
  /** The rewritten voiceover, in the twin's voice and market. */
  script: string;
  shots: RecastShot[];
  /** Anything the user should know before spending credits. */
  notes: string[];
};

const RECAST_SCHEMA = {
  type: "object",
  properties: {
    script: { type: "string" },
    shots: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "number" },
          line: { type: "string" },
          prompt: { type: "string" },
        },
        required: ["index", "line", "prompt"],
        additionalProperties: false,
      },
    },
  },
  required: ["script", "shots"],
  additionalProperties: false,
};

/**
 * Decide which renderer a shot belongs to, before any model is asked.
 *
 * Deliberately not left to the LLM. The rule is a hard consequence of which
 * models will hold a likeness: a face pointed at the camera must come from
 * Fabric, because Seedance is the only other option and it both refuses face
 * references and would redraw the person every shot. Anything where the
 * presenter is turned away, far off, or absent is safe to generate.
 */
function routeShot(shot: BlueprintShot): { render: "avatar" | "scene"; reason: string } {
  if (shot.presenterFraming === "front" || shot.presenterFraming === "profile") {
    return {
      render: "avatar",
      reason:
        shot.kind === "talking"
          ? "The presenter speaks to camera here, so it renders from your portrait and your voice."
          : "The presenter's face is visible here, so it renders from your portrait to keep the likeness identical.",
    };
  }
  return {
    render: "scene",
    reason:
      shot.presenterFraming === "absent"
        ? "Nobody is on screen, so this is generated as a scene."
        : `The presenter is ${shot.presenterFraming === "back" ? "turned away" : "far from camera"}, so this is generated as a scene — no face to keep consistent.`,
  };
}

/**
 * Rewrite a blueprint as instructions for the user's own twin.
 *
 * `twin` is a Character whose portrait is the user's real photograph, so this
 * refuses anything not marked as such. Re-shooting an ad in someone's likeness
 * is exactly the operation that needs the consent record to exist, and a
 * fictional character routed down this path would silently produce a video of
 * a person who never agreed to it.
 */
export async function recastForTwin(
  blueprint: AdBlueprint,
  twin: Character,
  context: { business?: string; market?: string; offer?: string } = {},
): Promise<RecastPlan> {
  if (twin.identity_type !== "real_person") {
    throw new Error(
      `${twin.name} isn't set up as a real person, so it can't be used as your on-camera twin. Mark it as your own likeness in Character Studio first.`,
    );
  }
  if (!(twin.reference_images ?? []).some((u) => typeof u === "string" && u)) {
    throw new Error(`${twin.name} has no photo yet — add one in Character Studio first.`);
  }

  const routed = blueprint.shots.map((s) => ({ shot: s, ...routeShot(s) }));

  const system = [
    "You adapt a proven ad's structure for a different presenter and a different business.",
    "You are given a shot-by-shot blueprint of the reference ad, and the presenter who will now appear in it.",
    "",
    "Keep the STRUCTURE: the number of shots, their order, their lengths, the camera work, the pacing and the persuasion arc. That structure is why the reference worked.",
    "Replace the SPECIFICS: the words, the setting and the props become this presenter's own business, market and offer.",
    "",
    "For each shot return:",
    "- line: the voiceover heard over that shot, rewritten in this presenter's voice. Keep it close in length to the original — it has to fit the same seconds. Empty string if the original shot was silent.",
    "  A SCENE shot is rendered without the presenter, so it cannot speak. Where the original had words over a SCENE shot, fold them into the nearest AVATAR shot's line instead of dropping them, and leave the SCENE shot's line empty — every idea in the reference should still be said out loud somewhere.",
    "- prompt: for shots marked SCENE, a generation prompt for a text-to-video model. Describe setting, framing, camera movement, lighting and duration. Never name or describe the presenter's face, and never ask for on-screen text — captions are added afterwards. For shots marked AVATAR, return an empty string; those render from the presenter's own portrait.",
    "",
    "Also return `script`: the full rewritten voiceover as one piece of copy.",
    "Write copy this presenter could say out loud. Do not invent claims, numbers, credentials or offers that were not given to you.",
  ].join("\n");

  const brief = [
    personaBlock(twin),
    context.business ? `BUSINESS: ${context.business}` : "",
    context.market ? `MARKET: ${context.market}` : "",
    context.offer ? `OFFER: ${context.offer}` : "",
    "",
    `REFERENCE ARC: ${blueprint.arc}`,
    `REFERENCE FORMAT: ${blueprint.formatDna}`,
    `REFERENCE HOOK: ${blueprint.hook}`,
    `REFERENCE SCRIPT: ${blueprint.script}`,
    "",
    "SHOTS:",
    ...routed.map(
      ({ shot, render }) =>
        `#${shot.index} [${render.toUpperCase()}] ${(shot.endSec - shot.startSec).toFixed(1)}s — setting: ${shot.setting} | camera: ${shot.camera} | original line: ${shot.line || "(silent)"}`,
    ),
  ]
    .filter(Boolean)
    .join("\n");

  const out = await anthropicJson<{ script: string; shots: { index: number; line: string; prompt: string }[] }>({
    system,
    user: brief,
    schema: RECAST_SCHEMA,
    effort: "medium",
    maxTokens: 5000,
  });

  const byIndex = new Map(out.shots.map((s) => [s.index, s]));
  const shots: RecastShot[] = routed.map(({ shot, render, reason }) => {
    const written = byIndex.get(shot.index);
    return {
      index: shot.index,
      seconds: Number((shot.endSec - shot.startSec).toFixed(2)),
      render,
      line: render === "avatar" ? (written?.line ?? "").trim() : "",
      prompt: render === "scene" ? (written?.prompt ?? "").trim() : "",
      reason,
    };
  });

  const notes: string[] = [];

  /**
   * Warn when a line cannot be said in the seconds it was written for.
   *
   * A scene shot is rendered to a requested duration, but an avatar shot is
   * only as long as its audio — Fabric drives a portrait with a voice track and
   * stops when the voice does. So an over-long line does not get cut off, it
   * silently stretches the finished ad past the length the plan promised, and
   * the pacing that made the reference work goes with it.
   *
   * 2.6 words/second is unhurried delivery to camera. Flagged at 1.3x rather
   * than 1.0 because the estimate is rough and a small overrun is unnoticeable.
   */
  const WORDS_PER_SEC = 2.6;
  const overrunning = shots
    .filter((s) => s.render === "avatar" && s.line)
    .map((s) => ({
      index: s.index,
      needed: s.line.trim().split(/\s+/).length / WORDS_PER_SEC,
      have: s.seconds,
    }))
    .filter((s) => s.needed > s.have * 1.3);
  if (overrunning.length) {
    const worst = overrunning.reduce((a, b) => (b.needed - b.have > a.needed - a.have ? b : a));
    notes.push(
      `${overrunning.length} spoken shot(s) have more words than their slot — shot ${worst.index + 1} needs about ${Math.round(worst.needed)}s of speech in a ${worst.have.toFixed(1)}s shot. A spoken shot runs as long as its audio, so the finished ad will come out longer than planned unless those lines are trimmed.`,
    );
  }

  const silentAvatars = shots.filter((s) => s.render === "avatar" && !s.line);
  if (silentAvatars.length) {
    notes.push(
      `${silentAvatars.length} shot(s) show your face but have no line — they need words, or switch them to a scene.`,
    );
  }
  const emptyScenes = shots.filter((s) => s.render === "scene" && !s.prompt);
  if (emptyScenes.length) {
    notes.push(`${emptyScenes.length} scene shot(s) came back without a prompt and will need one before rendering.`);
  }
  if (blueprint.captionStyle) {
    notes.push(
      "The reference burns its captions into the picture. Yours are added as a track afterwards, so they match the new script instead of the old one.",
    );
  }

  return {
    totalSeconds: Number(shots.reduce((t, s) => t + s.seconds, 0).toFixed(2)),
    aspect: blueprint.aspect,
    script: out.script.trim(),
    shots,
    notes,
  };
}
